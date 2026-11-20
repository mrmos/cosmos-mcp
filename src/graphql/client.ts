import { statSync } from "node:fs";
import type { CosmosConfig } from "../config";
import { CosmosError, classify, describe, type CosmosGraphQLError } from "../errors";

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: CosmosGraphQLError[];
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

/** Reload the config when the `login` credential file at `path` changes, so sign-in needs no restart. */
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
  private viewerPromise: Promise<Viewer | null> | undefined;
  private readonly watch: CredentialWatch | undefined;
  private watchedMtime: number;

  constructor(config: CosmosConfig, watch?: CredentialWatch) {
    this.currentConfig = config;
    this.watch = watch;
    this.watchedMtime = watch ? mtimeOf(watch.path) : 0;
  }

  get config(): CosmosConfig {
    // An environment or .env credential outranks the file, so a change there cannot take effect.
    const source = this.currentConfig.credentialSource;
    if (this.watch && source !== "environment" && source !== "dotenv") {
      const mtime = mtimeOf(this.watch.path);
      if (mtime !== this.watchedMtime) {
        this.watchedMtime = mtime;
        this.currentConfig = this.watch.reload();
        this.viewerPromise = undefined;
      }
    }
    return this.currentConfig;
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
   * Cosmos returns partial data plus `errors` for fields the viewer may not
   * read (a private cluster inside a public list). We return usable partial
   * data, but throw for a mutation with any error or a query whose top-level
   * fields are all null.
   *
   * Mutations are retried only after a 429: a timeout or 5xx can follow a
   * write that landed, and replaying it would save twice.
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
    // A 401 resolves to null and stays cached. Anything thrown is dropped so the
    // next call retries, a 403 included: it can be a WAF hiccup, and caching it
    // would sign the server out until restart.
    this.viewerPromise ??= this.fetchViewer().catch((err) => {
      this.viewerPromise = undefined;
      return forbiddenAsNull(err);
    });
    return this.viewerPromise;
  }

  /**
   * Asks cosmos.so who the credential belongs to, always over the network —
   * unlike `viewer()`, it does not trust a stored or configured user id.
   * Null means the credential was rejected; anything else that goes wrong
   * (network, 5xx, rate limit) throws, so callers can tell the two apart.
   */
  async verify(): Promise<Viewer | null> {
    if (!this.hasCredentials) return null;
    return this.fetchViewer().catch(forbiddenAsNull);
  }

  /** The `me` lookup. Null on a 401; a 403 throws so `viewer()` does not cache it. */
  private async fetchViewer(): Promise<Viewer | null> {
    try {
      const d = await this.request<{ me: { id: number; username: string } | null }>(
        "CosmosMcpViewer",
        "query CosmosMcpViewer { me { id username } }",
      );
      return d.me ? { id: d.me.id, username: d.me.username } : null;
    } catch (err) {
      if (err instanceof CosmosError && err.kind === "unauthenticated") return null;
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

function forbiddenAsNull(err: unknown): null {
  if (err instanceof CosmosError && err.kind === "forbidden") return null;
  throw err;
}

/** 0 when the file is missing: logout removed it, or login has not run yet. */
function mtimeOf(path: string): number {
  return statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? 0;
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
