import type { IdentifierGenerator, ResourceIdentifier } from '@solid/community-server';
import { BadRequestHttpError } from '@solid/community-server';

/**
 * Refuses a pod name before CSS creates the pod, when the name would not make
 * a usable subdomain or is reserved. Wraps the stock generator; everything
 * else is the stock generator's.
 *
 * Why it exists: with subdomain pods the name becomes a hostname, and CSS 7.2
 * checks nothing but that it is non-empty (CreatePodHandler, `min(1)`). Its
 * generator replaces `\W` with `-` and lower-cases, so `open_fab` passes
 * unchanged, and `_` is not allowed in a hostname: the pod exists, but no
 * certificate covers it and browsers refuse it. A name over 63 characters
 * fails the same way. `www` is created and then answers 403 forever, because
 * the file mapper keeps it for the bare domain. A name such as `mcp` gets a
 * pod that the gateway hides behind its own `mcp.` vhost.
 *
 * Every way a pod gets created (the form, the account API, a seed file) goes
 * through the IdentifierGenerator, so this is the one place that covers all of
 * them. The create-pod form runs the same check first for a quicker message;
 * the form alone would be a suggestion, since anyone can call the API.
 *
 * It refuses and never corrects: silently turning `open_fab` into `open-fab`
 * would hand the person an address they did not choose.
 */
export class PodNameGuard implements IdentifierGenerator {
  private readonly source: IdentifierGenerator;
  private readonly reserved: Set<string>;

  /**
   * @param source - The generator that makes the identifier once the name passes.
   * @param reserved - Names no account may take, compared after CSS's own clean-up.
   */
  public constructor(source: IdentifierGenerator, reserved: string[] = []) {
    this.source = source;
    this.reserved = new Set(reserved.map((name): string => name.toLowerCase()));
  }

  public generate(name: string): ResourceIdentifier {
    const problem = podNameProblem(name, this.reserved);
    if (problem) {
      throw new BadRequestHttpError(problem);
    }
    return this.source.generate(name);
  }

  public extractPod(identifier: ResourceIdentifier): ResourceIdentifier {
    return this.source.extractPod(identifier);
  }
}

// One DNS label (RFC 1123): a–z, 0–9 and `-`, 1 to 63 long, no `-` at either end.
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

/**
 * Why `name` cannot be a pod, in words the create-pod form can show as is;
 * undefined when it can. Exported for the tests, and kept in step with the
 * form's copy in overlay/templates/identity/account/create-pod.html.ejs.
 */
export function podNameProblem(name: string, reserved: Set<string>): string | undefined {
  // The same clean-up as SubdomainIdentifierGenerator (sanitizeUrlPart, then
  // lower case), so the check applies to the address CSS would really make.
  const label = name.trim().replaceAll(/\W/gu, '-').toLowerCase();
  if (reserved.has(label)) {
    return `"${label}" is reserved on this server. Please choose another name.`;
  }
  if (label.length > 63) {
    return `A pod name can be 63 characters at most (this one has ${label.length}): it becomes the pod's address.`;
  }
  if (!LABEL.test(label)) {
    return `"${name}" cannot be a pod name: it becomes the pod's address, which can only hold ` +
      'the letters a to z, digits and hyphens, and cannot start or end with a hyphen.';
  }
  return undefined;
}
