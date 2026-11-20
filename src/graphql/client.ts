import { statSync } from "node:fs";
import type { CosmosConfig } from "../config";
import { CosmosError, classify, describe, type CosmosGraphQLError } from "../errors";

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: CosmosGraphQLError[];
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

/**
 * Lets a running server notice `cosmos-mcp login` without a client restart.
 * `path` is the stored-credential file; `reload` rebuilds the config from
 * scratch when that file changes.
 */
export interface CredentialWatch {
  path: string;
  reload: () => CosmosConfig;
}

const isMutation = (query: string) => /^\s*mutation\b/.test(query);

/**
 * Thin GraphQL client for api.cosmos.so.
 *
 * The endpoint mirrors what cosmos-web sends, including the `?q=<operation>`
 * query parameter — the API uses it for routing and logging, and requests
 * without it are treated as unknown clients.
 */
export class CosmosClient {
  private currentConfig: CosmosConfig;
  private viewerPromise: Promise<ViewerCheck> | undefined;
  private readonly watch: CredentialWatch | undefined;
  private watchedMtime: number;

  constructor(config: CosmosConfig, watch?: CredentialWatch) {
    this.currentConfig = config;
    this.watch = watch;
    this.watchedMtime = watch ? mtimeOf(watch.path) : 0;
  }

  get config(): CosmosConfig {
    this.syncStoredCredential();
    return this.currentConfig;
  }

  /**
   * Re-reads the config when the file `login`/`logout` writes has changed.
   * A credential from the environment or `.env` outranks that file, so the
   * check is skipped then: nothing written there could take effect.
   */
  private syncStoredCredential(): void {
    if (!this.watch) return;
    const source = this.currentConfig.credentialSource;
    if (source === "environment" || source === "dotenv") return;
    const mtime = mtimeOf(this.watch.path);
    if (mtime === this.watchedMtime) return;
    this.watchedMtime = mtime;
    this.currentConfig = this.watch.reload();
    this.viewerPromise = undefined;
  }

  /** True when a credential is configured. Says nothing about it still being valid. */
  get hasCredentials(): boolean {
    return Boolean(this.config.cookie || this.config.authorization);
  }

  private headers(): Record<string, string> {
    const config = this.currentConfig;
    const h: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/graphql-response+json,application/json;q=0.9",
      "x-client-name": config.clientName,
      origin: "https://www.cosmos.so",
      referer: "https://www.cosmos.so/",
      "user-agent": config.userAgent,
    };
    if (config.cookie) h.cookie = config.cookie;
    if (config.authorization) h.authorization = config.authorization;
    return h;
  }

  /**
   * Executes one operation. Throws `CosmosError` on transport failure or when
   * the response carries errors and no usable data.
   *
   * Cosmos returns partial data with a non-empty `errors` array for fields the
   * viewer may not read (a private cluster inside a public list, say). When
   * `data` still holds something usable we return it and let the caller
   * decide. Two exceptions throw instead: a mutation with any error (a write
   * that half-happened is not a success), and a query whose every top-level
   * field came back null (there is nothing to decide with).
   *
   * Mutations are never retried after the request may have reached the
   * server — a timeout or 5xx can follow a write that landed, and replaying it
   * would save twice or report a successful delete as "not found". A 429 is
   * the exception: the server refused it before doing anything.
   */
  async request<T>(operationName: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const config = this.config;
    const url = `${config.endpoint}?q=${encodeURIComponent(operationName)}`;
    const body = JSON.stringify({ operationName, query, variables });
    const write = isMutation(query);
    const unsureWrite = write
      ? " The write may or may not have been applied: check (for example with cosmos_get_cluster) before retrying."
      : "";

    let lastError: CosmosError | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let res: Response;
      let text: string;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: this.headers(),
          body,
          signal: AbortSignal.timeout(config.timeoutMs),
        });
        if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_ATTEMPTS && (!write || res.status === 429)) {
          await res.body?.cancel().catch(() => {});
          await backoff(attempt);
          continue;
        }
        // Inside the try: the timeout and connection resets can fire mid-body too.
        text = await res.text();
      } catch (cause) {
        lastError = new CosmosError(`${operationName}: request to cosmos.so failed (${String(cause)}).${unsureWrite}`, {
          kind: "network",
          operation: operationName,
          cause,
        });
        if (!write && attempt < MAX_ATTEMPTS) {
          await backoff(attempt);
          continue;
        }
        throw lastError;
      }

      if (write && res.status >= 500) {
        throw new CosmosError(`${operationName}: cosmos.so returned HTTP ${res.status}.${unsureWrite}`, {
          kind: "server",
          status: res.status,
          operation: operationName,
        });
      }

      let payload: GraphQLResponse<T>;
      try {
        payload = JSON.parse(text) as GraphQLResponse<T>;
      } catch (cause) {
        throw new CosmosError(
          `${operationName}: cosmos.so returned a non-JSON response (HTTP ${res.status}): ${text.slice(0, 300)}`,
          { kind: res.ok ? "unknown" : classify(undefined, res.status), status: res.status, operation: operationName, cause },
        );
      }

      const errors = payload.errors ?? [];
      if (errors.length > 0 && (write || nothingUsable(payload.data))) {
        const kind = classify(errors[0]?.extensions?.code as string | undefined, res.status);
        throw new CosmosError(describe(kind, errors, operationName, Boolean(config.cookie || config.authorization)), {
          kind,
          status: res.status,
          operation: operationName,
          graphQLErrors: errors,
        });
      }

      if (payload.data === undefined || payload.data === null) {
        throw new CosmosError(`${operationName}: cosmos.so returned no data (HTTP ${res.status})`, {
          kind: classify(undefined, res.status),
          status: res.status,
          operation: operationName,
        });
      }

      return payload.data;
    }

    throw lastError ?? new CosmosError(`${operationName}: exhausted retries`, { kind: "unknown", operation: operationName });
  }

  /**
   * Resolves the signed-in user, caching both hits and misses. Returns null
   * when no credential is configured or the session has expired, so read-only
   * tools can keep working instead of hard-failing.
   */
  async viewer(): Promise<Viewer | null> {
    const config = this.config;
    if (!config.cookie && !config.authorization) return null;
    if (config.userId) return { id: config.userId, username: config.username ?? null };
    this.viewerPromise ??= this.checkViewer().catch((err) => {
      this.viewerPromise = undefined; // transient failure: allow a retry
      throw err;
    });
    const result = await this.viewerPromise;
    // Only a definite 401 is worth remembering. A 403 can be a WAF or load
    // balancer having a moment, and caching it would sign the server out until
    // restart.
    if (result === "forbidden") this.viewerPromise = undefined;
    return typeof result === "string" ? null : result;
  }

  /**
   * Asks cosmos.so who the credential belongs to, always over the network —
   * unlike `viewer()`, it does not trust a stored or configured user id.
   * Null means the credential was rejected; anything else that goes wrong
   * (network, 5xx, rate limit) throws, so callers can tell the two apart.
   */
  async verify(): Promise<Viewer | null> {
    const result = await this.checkViewer();
    return typeof result === "string" ? null : result;
  }

  /** The `me` lookup, keeping a 401 apart from a 403 so `viewer()` can cache only the first. */
  private async checkViewer(): Promise<ViewerCheck> {
    if (!this.hasCredentials) return "unauthenticated";
    try {
      const d = await this.request<{ me: { id: number; username: string } | null }>(
        "CosmosMcpViewer",
        "query CosmosMcpViewer { me { id username } }",
      );
      return d.me ? { id: d.me.id, username: d.me.username } : "unauthenticated";
    } catch (err) {
      if (err instanceof CosmosError && (err.kind === "unauthenticated" || err.kind === "forbidden")) return err.kind;
      throw err;
    }
  }

  /** Like `viewer()`, but throws the actionable auth error when unavailable. */
  async requireViewer(operation: string): Promise<Viewer> {
    const v = await this.viewer();
    if (v) return v;
    throw new CosmosError(describe("unauthenticated", [], operation), {
      kind: "unauthenticated",
      operation,
    });
  }

  /** Public lookup of a user id from a username. */
  async userIdForUsername(username: string): Promise<number> {
    const data = await this.request<{ user: { id: number } | null }>(
      "CosmosMcpUserId",
      "query CosmosMcpUserId($username: String!) { user(username: $username) { id } }",
      { username },
    );
    if (!data.user) {
      throw new CosmosError(`No cosmos.so user named ${JSON.stringify(username)}`, {
        kind: "not_found",
        operation: "CosmosMcpUserId",
      });
    }
    return data.user.id;
  }
}

export interface Viewer {
  id: number;
  /** Null when the id came from COSMOS_USER_ID rather than a `me` lookup. */
  username: string | null;
}

/** A resolved viewer, or why the credential was turned away. */
type ViewerCheck = Viewer | "unauthenticated" | "forbidden";

function mtimeOf(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0; // missing: logout removed it, or login has not run yet
  }
}

/** True when there is no data, or every top-level field in it is null. */
function nothingUsable(data: unknown): boolean {
  if (data === undefined || data === null) return true;
  if (typeof data !== "object") return false;
  const values = Object.values(data as Record<string, unknown>);
  return values.length > 0 && values.every((v) => v === null);
}

function backoff(attempt: number): Promise<void> {
  return new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
}
