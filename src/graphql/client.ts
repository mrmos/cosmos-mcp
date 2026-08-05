import type { CosmosConfig } from "../config";
import { CosmosError, classify, describe, type CosmosGraphQLError } from "../errors";

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: CosmosGraphQLError[];
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

/**
 * Thin GraphQL client for api.cosmos.so.
 *
 * The endpoint mirrors what cosmos-web sends, including the `?q=<operation>`
 * query parameter — the API uses it for routing and logging, and requests
 * without it are treated as unknown clients.
 */
export class CosmosClient {
  readonly config: CosmosConfig;
  private viewerId: number | null | undefined;
  private viewerPromise: Promise<Viewer | null> | undefined;

  constructor(config: CosmosConfig) {
    this.config = config;
  }

  /** True when a credential is configured. Says nothing about it still being valid. */
  get hasCredentials(): boolean {
    return Boolean(this.config.cookie || this.config.authorization);
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/graphql-response+json,application/json;q=0.9",
      "x-client-name": this.config.clientName,
      origin: "https://www.cosmos.so",
      referer: "https://www.cosmos.so/",
      "user-agent": this.config.userAgent,
    };
    if (this.config.cookie) h.cookie = this.config.cookie;
    if (this.config.authorization) h.authorization = this.config.authorization;
    return h;
  }

  /**
   * Executes one operation. Throws `CosmosError` on transport failure or when
   * the response carries errors and no usable data.
   *
   * Cosmos returns partial data with a non-empty `errors` array for fields the
   * viewer may not read (a private cluster inside a public list, say). When
   * `data` is present we return it and let the caller decide.
   */
  async request<T>(operationName: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const url = `${this.config.endpoint}?q=${encodeURIComponent(operationName)}`;
    const body = JSON.stringify({ operationName, query, variables });

    let lastError: CosmosError | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: this.headers(),
          body,
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });
      } catch (cause) {
        lastError = new CosmosError(`${operationName}: request to cosmos.so failed (${String(cause)})`, {
          kind: "network",
          operation: operationName,
          cause,
        });
        if (attempt < MAX_ATTEMPTS) {
          await backoff(attempt);
          continue;
        }
        throw lastError;
      }

      if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_ATTEMPTS) {
        await backoff(attempt);
        continue;
      }

      const text = await res.text();
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
      if (errors.length > 0 && (payload.data === undefined || payload.data === null)) {
        const kind = classify(errors[0]?.extensions?.code as string | undefined, res.status);
        throw new CosmosError(describe(kind, errors, operationName), {
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
    if (this.config.userId) return { id: this.config.userId, username: null };
    if (!this.hasCredentials) return null;
    this.viewerPromise ??= this.request<{ me: { id: number; username: string } }>(
      "CosmosMcpViewer",
      "query CosmosMcpViewer { me { id username } }",
    )
      .then((d) => ({ id: d.me.id, username: d.me.username }))
      .catch((err) => {
        if (err instanceof CosmosError && (err.kind === "unauthenticated" || err.kind === "forbidden")) return null;
        this.viewerPromise = undefined; // transient failure: allow a retry
        throw err;
      });
    return this.viewerPromise;
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

function backoff(attempt: number): Promise<void> {
  return new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
}
