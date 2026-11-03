import { timingSafeEqual } from 'node:crypto';
import type {
  AccountLoginStorage,
  AuxiliaryStrategy,
  DataAccessor,
  JsonInteractionHandlerInput,
  JsonRepresentation,
  PasswordStore,
  PodStore,
  ReadWriteLocker,
  ResourceIdentifier,
  ResourceStore,
  WebIdStore,
} from '@solid/community-server';
import {
  BadRequestHttpError,
  ForbiddenHttpError,
  getLoggerFor,
  isContainerIdentifier,
  JsonInteractionHandler,
  NotFoundHttpError,
} from '@solid/community-server';

/** One account as the admin tools show it. */
export interface AccountSummary {
  accountId: string;
  emails: string[];
  pods: string[];
  webIds: string[];
}

/**
 * Lists the server's accounts and deletes one with its pods, for whoever
 * runs a command on the server itself. Stock CSS can do neither (7.3.0: its
 * account API deletes a login, a WebID link, client credentials and a pod
 * owner, nothing more, and lists only the caller's own), so a pod name once
 * taken stayed taken and the right to erasure could not be honoured. Decided
 * in solid-kit ADR 012; kept small and upstream-shaped so it can be offered
 * to CSS and dropped from the image the release CSS has its own.
 *
 * POST `{ "token": "...", "action": "list" }` or
 * POST `{ "token": "...", "action": "delete", "email": "..." }` (or `accountId`).
 *
 * WHO MAY: whoever can read the token, i.e. has a shell on the server. The
 * token is random, written at every start by start/admins.js into this
 * component's config and into a file only the container's user can read;
 * the admin TUI (start/admin.js, run with `docker compose exec`) reads it
 * there. Until 7.3.0-4's first draft this was a list of login emails
 * (ADMIN_EMAILS), dropped before release: stock CSS never verifies a login's
 * email, so a listed address nobody had signed up with yet made whoever took
 * it first an admin, and ssh already says who runs the server.
 *
 * Deletion order, and why:
 * 1. Each pod's resources are deleted depth first through the resource store,
 *    so CSS takes the locks, removes auxiliary resources and sends the
 *    notifications, as it would for a DELETE request.
 * 2. The pod root is then removed through the data accessor, under the write
 *    lock. The store refuses it: "Cannot delete a root storage container"
 *    (DataAccessorBasedStore.deleteResource, Solid protocol §5.4), and with
 *    subdomain pods every pod root is one (with folder pods too: the root is
 *    marked pim:Storage). Leaving it would keep the name taken:
 *    GeneratedPodManager.createPod answers 409 while anything is at the base.
 * 3. Last, `delete('account', id)` on the account storage. The account is the
 *    root record of that storage, so this removes its logins, pods, WebID
 *    links and client credentials in one go, and updates their indexes (the
 *    stock 30-minute clean-up of accounts without a login uses the same call).
 *    If anything above fails, the account is still there and the call can be
 *    run again.
 *
 * Not here: the connector's identities.json lives outside CSS. The answer
 * lists the WebIDs and pods that went, and scripts/admin.sh removes the
 * connector's agents for them.
 */
export class AccountAdminHandler extends JsonInteractionHandler {
  protected readonly logger = getLoggerFor(this);

  private readonly accountStorage: AccountLoginStorage<Record<string, never>>;
  private readonly passwordStore: PasswordStore;
  private readonly podStore: PodStore;
  private readonly webIdStore: WebIdStore;
  private readonly store: ResourceStore;
  private readonly accessor: DataAccessor;
  private readonly auxiliaryStrategy: AuxiliaryStrategy;
  private readonly locker: ReadWriteLocker;
  private readonly token: Buffer;

  /**
   * @param accountStorage - The account storage (urn:solid-server:default:AccountStorage).
   * @param passwordStore - Finds an account's logins, and an account by login.
   * @param podStore - Finds an account's pods.
   * @param webIdStore - Finds an account's WebID links.
   * @param store - The resource store, for everything below a pod root.
   * @param accessor - The backend's data accessor, for the pod root itself.
   * @param auxiliaryStrategy - Tells which children the store removes with their subject.
   * @param locker - The resource locker the store uses.
   * @param token - The secret a caller must send. Shorter than 32 characters: every call is refused.
   */
  public constructor(
    accountStorage: AccountLoginStorage<Record<string, never>>,
    passwordStore: PasswordStore,
    podStore: PodStore,
    webIdStore: WebIdStore,
    store: ResourceStore,
    accessor: DataAccessor,
    auxiliaryStrategy: AuxiliaryStrategy,
    locker: ReadWriteLocker,
    token: string,
  ) {
    super();
    this.accountStorage = accountStorage;
    this.passwordStore = passwordStore;
    this.podStore = podStore;
    this.webIdStore = webIdStore;
    this.store = store;
    this.accessor = accessor;
    this.auxiliaryStrategy = auxiliaryStrategy;
    this.locker = locker;
    this.token = Buffer.from(token ?? '');
  }

  public async handle({ json }: JsonInteractionHandlerInput): Promise<JsonRepresentation> {
    const input = (json ?? {}) as { token?: unknown; action?: unknown; email?: unknown; accountId?: unknown };
    this.checkToken(input.token);
    if (input.action === 'list') {
      return { json: { accounts: await this.list() } as never };
    }
    if (input.action === 'delete') {
      const deleted = await this.delete(await this.findTarget(input));
      return { json: { deleted } as never };
    }
    throw new BadRequestHttpError('"action" is "list" or "delete".');
  }

  private checkToken(sent: unknown): void {
    const given = Buffer.from(typeof sent === 'string' ? sent : '');
    // A short or missing configured token refuses everyone: an image started
    // without start/admins.js must not answer to an empty token.
    if (this.token.length < 32 || given.length !== this.token.length || !timingSafeEqual(given, this.token)) {
      this.logger.warn('Refused an account admin call without the right token');
      throw new ForbiddenHttpError('Account administration is done from the server itself (scripts/admin.sh).');
    }
  }

  private async list(): Promise<AccountSummary[]> {
    const accounts: AccountSummary[] = [];
    for await (const account of this.accountStorage.entries('account')) {
      accounts.push(await this.summary(account.id));
    }
    return accounts;
  }

  private async summary(accountId: string): Promise<AccountSummary> {
    return {
      accountId,
      emails: (await this.passwordStore.findByAccount(accountId)).map((login): string => login.email),
      pods: (await this.podStore.findPods(accountId)).map((pod): string => pod.baseUrl),
      webIds: (await this.webIdStore.findLinks(accountId)).map((link): string => link.webId),
    };
  }

  private async findTarget({ email, accountId }: { email?: unknown; accountId?: unknown }): Promise<string> {
    if (typeof email === 'string' && email.length > 0) {
      const login = await this.passwordStore.findByEmail(email.trim().toLowerCase());
      if (!login) {
        throw new NotFoundHttpError(`No account has the login ${email}.`);
      }
      return login.accountId;
    }
    if (typeof accountId === 'string' && accountId.length > 0) {
      // Accounts without a login exist (sign-up left halfway, removed by
      // stock after 30 minutes): the id is the only way to name them.
      if (!await this.accountStorage.has('account', accountId)) {
        throw new NotFoundHttpError(`No account ${accountId}.`);
      }
      return accountId;
    }
    throw new BadRequestHttpError('Say which account: "email" or "accountId".');
  }

  private async delete(accountId: string): Promise<AccountSummary> {
    const summary = await this.summary(accountId);
    for (const pod of summary.pods) {
      await this.deletePod({ path: pod });
    }
    await this.accountStorage.delete('account', accountId);
    this.logger.info(`Deleted account ${accountId} (${summary.emails.join(', ') || 'no login'}), ` +
      `pods ${summary.pods.join(', ') || 'none'}`);
    return summary;
  }

  private async deletePod(root: ResourceIdentifier): Promise<void> {
    for (const child of await this.listChildren(root)) {
      await this.deleteTree(child);
    }
    await this.locker.withWriteLock(root, async(): Promise<void> => {
      try {
        // A container's deletion takes its folder and everything left in it
        // (the root's .acl and .meta), FileDataAccessor 7.3.0.
        await this.accessor.deleteResource(root);
      } catch (error: unknown) {
        if (!NotFoundHttpError.isInstance(error)) {
          throw error;
        }
      }
    });
  }

  private async deleteTree(identifier: ResourceIdentifier): Promise<void> {
    if (isContainerIdentifier(identifier)) {
      for (const child of await this.listChildren(identifier)) {
        await this.deleteTree(child);
      }
    }
    try {
      await this.store.deleteResource(identifier);
    } catch (error: unknown) {
      // Gone already: an auxiliary resource the store removed with its
      // subject, or a resource someone else deleted meanwhile.
      if (!NotFoundHttpError.isInstance(error)) {
        throw error;
      }
    }
  }

  /**
   * The children worth deleting one by one: auxiliary resources (.acl, .meta)
   * go with their subject, and the store refuses a .meta outright.
   */
  private async listChildren(container: ResourceIdentifier): Promise<ResourceIdentifier[]> {
    const children: ResourceIdentifier[] = [];
    for await (const metadata of this.accessor.getChildren(container)) {
      const child = { path: metadata.identifier.value };
      if (!this.auxiliaryStrategy.isAuxiliaryIdentifier(child)) {
        children.push(child);
      }
    }
    // Listed first, deleted after: a folder is not changed under its iterator.
    return children;
  }
}
