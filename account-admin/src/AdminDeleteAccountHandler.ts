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
  UnauthorizedHttpError,
} from '@solid/community-server';

/**
 * Deletes an account and its pods, for an admin of the instance. Stock CSS
 * cannot delete either (7.3.0: its account API deletes a login, a WebID link,
 * client credentials and a pod owner, nothing more), so a pod name once taken
 * stayed taken and the right to erasure could not be honoured. Decided in
 * solid-kit ADR 012; kept small and upstream-shaped so it can be offered to
 * CSS and dropped from the image the release CSS has its own.
 *
 * POST `{ "email": "<login email>" }` (or `{ "accountId": "<id>" }`), signed
 * in to the account API (cookie or `Authorization: CSS-Account-Token`) as an
 * account whose login email is in `admins`.
 *
 * Order, and why:
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
 * lists the WebIDs that went, and scripts/admin.sh removes them there.
 */
export class AdminDeleteAccountHandler extends JsonInteractionHandler {
  protected readonly logger = getLoggerFor(this);

  private readonly admins: Set<string>;

  /**
   * @param accountStorage - The account storage (urn:solid-server:default:AccountStorage).
   * @param passwordStore - Finds the logins of the caller and of the target.
   * @param podStore - Finds the target's pods.
   * @param webIdStore - Finds the target's WebID links, reported to the caller.
   * @param store - The resource store, for everything below a pod root.
   * @param accessor - The backend's data accessor, for the pod root itself.
   * @param auxiliaryStrategy - Tells which children the store removes with their subject.
   * @param locker - The resource locker the store uses.
   * @param admins - Login emails allowed to delete any account. Empty: nobody can.
   */
  public constructor(
    private readonly accountStorage: AccountLoginStorage<Record<string, never>>,
    private readonly passwordStore: PasswordStore,
    private readonly podStore: PodStore,
    private readonly webIdStore: WebIdStore,
    private readonly store: ResourceStore,
    private readonly accessor: DataAccessor,
    private readonly auxiliaryStrategy: AuxiliaryStrategy,
    private readonly locker: ReadWriteLocker,
    admins: string[] = [],
  ) {
    super();
    this.admins = new Set(admins.map((email): string => email.trim().toLowerCase()).filter(Boolean));
  }

  public async handle({ accountId, json }: JsonInteractionHandlerInput): Promise<JsonRepresentation> {
    if (!accountId) {
      throw new UnauthorizedHttpError('Sign in to the account API first.');
    }
    const callerLogins = await this.passwordStore.findByAccount(accountId);
    const caller = callerLogins.find((login): boolean => this.admins.has(login.email.toLowerCase()));
    if (!caller) {
      this.logger.warn(`Account ${accountId} tried to delete an account without being an admin`);
      throw new ForbiddenHttpError('Only an admin of this server can delete an account.');
    }

    const targetId = await this.findTarget(json);
    if (targetId === accountId) {
      // Deleting one's own account is the self-service door (ADR 012, later
      // slice): it asks for the passphrase again and says what goes. An admin
      // locking themself out through the admin door is a mistake, not a use.
      throw new BadRequestHttpError('An admin cannot delete their own account through the admin route.');
    }

    const pods = await this.podStore.findPods(targetId);
    const webIds = (await this.webIdStore.findLinks(targetId)).map((link): string => link.webId);
    const emails = (await this.passwordStore.findByAccount(targetId)).map((login): string => login.email);

    for (const pod of pods) {
      await this.deletePod({ path: pod.baseUrl });
    }
    await this.accountStorage.delete('account', targetId);

    this.logger.info(`Admin ${caller.email} deleted account ${targetId} (${emails.join(', ')}), ` +
      `pods ${pods.map((pod): string => pod.baseUrl).join(', ') || 'none'}`);
    return { json: { deleted: { accountId: targetId, emails, pods: pods.map((pod): string => pod.baseUrl), webIds }}};
  }

  private async findTarget(json: unknown): Promise<string> {
    const { email, accountId } = (json ?? {}) as { email?: unknown; accountId?: unknown };
    if (typeof email === 'string' && email.length > 0) {
      const login = await this.passwordStore.findByEmail(email.trim().toLowerCase());
      if (!login) {
        throw new NotFoundHttpError(`No account has the login ${email}.`);
      }
      return login.accountId;
    }
    if (typeof accountId === 'string' && accountId.length > 0) {
      // The account storage has no plain "get"; its login listing tells
      // whether the account exists, as every account keeps at least one login.
      if ((await this.passwordStore.findByAccount(accountId)).length === 0 &&
        (await this.podStore.findPods(accountId)).length === 0) {
        throw new NotFoundHttpError(`No account ${accountId}.`);
      }
      return accountId;
    }
    throw new BadRequestHttpError('Say which account: { "email": "..." } or { "accountId": "..." }.');
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
