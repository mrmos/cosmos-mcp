/** The message of anything thrown, for error text. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** GraphQL error entry as returned by api.cosmos.so. */
export interface CosmosGraphQLError {
  message: string;
  path?: (string | number)[];
  extensions?: { code?: string; [k: string]: unknown };
}

export type CosmosErrorKind =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "validation"
  | "network"
  | "server"
  | "unknown";

/**
 * Every failure surfaced to a tool caller. `kind` is what tools branch on;
 * `message` is written for an agent to read and act on.
 */
export class CosmosError extends Error {
  readonly kind: CosmosErrorKind;
  readonly status?: number;
  readonly operation?: string;
  readonly graphQLErrors: CosmosGraphQLError[];

  constructor(
    message: string,
    opts: {
      kind: CosmosErrorKind;
      status?: number;
      operation?: string;
      graphQLErrors?: CosmosGraphQLError[];
      cause?: unknown;
    },
  ) {
    super(message, { cause: opts.cause });
    this.name = "CosmosError";
    this.kind = opts.kind;
    this.status = opts.status;
    this.operation = opts.operation;
    this.graphQLErrors = opts.graphQLErrors ?? [];
  }
}

const AUTH_HINT =
  "Ask the user to run `npx cosmos-mcp login` in their own terminal, then retry" +
  ": a running server picks up the saved credential without a restart. " +
  "Alternatively set COSMOS_AUTHORIZATION to the whole `Authorization` request header " +
  "(\"Bearer …\") from a signed-in cosmos.so browser session. Never ask the user to paste it into chat. " +
  "Search and browsing work without signing in; saving and collections do not.";

/** Maps a GraphQL error code plus HTTP status onto a `CosmosErrorKind`. */
export function classify(code: string | undefined, status: number): CosmosErrorKind {
  switch (code) {
    case "AUTHENTICATION":
      return "unauthenticated";
    case "FORBIDDEN":
    case "AUTHORIZATION":
      return "forbidden";
    case "NOT_FOUND":
      return "not_found";
    case "FIELDS_ON_CORRECT_TYPE":
    case "GRAPHQL_VALIDATION_FAILED":
    case "BAD_USER_INPUT":
    case "INTROSPECTION_NOT_ALLOWED":
      return "validation";
  }
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  if (status >= 400) return "validation";
  return "unknown";
}

/**
 * Codes that mean the query document itself no longer matches the API. The
 * agent cannot fix those by changing its arguments: Cosmos changed its private
 * schema, and only a new release of this server can.
 */
const SCHEMA_DRIFT_CODES = new Set([
  "FIELDS_ON_CORRECT_TYPE",
  "GRAPHQL_VALIDATION_FAILED",
  "UNKNOWN_ARGUMENT",
  "UNKNOWN_TYPE",
  "PROVIDED_REQUIRED_ARGUMENTS",
  "ARGUMENTS_OF_CORRECT_TYPE",
  "VARIABLES_ARE_INPUT_TYPES",
]);

const SCHEMA_DRIFT_HINT =
  "cosmos.so probably changed its private API. Tell the user to update with `npx -y cosmos-mcp@latest` " +
  "(npx can keep an old copy cached), or to report it at https://github.com/mrmos/cosmos-mcp/issues.";

/**
 * Builds the user-facing message for a set of GraphQL errors. `signedIn` says
 * whether the request carried a credential: Cosmos answers a signed-out read
 * of a private board with "forbidden", which then means "sign in", not
 * "this account lacks access".
 */
export function describe(
  kind: CosmosErrorKind,
  errors: CosmosGraphQLError[],
  operation: string,
  signedIn = true,
): string {
  const detail = errors.map((e) => e.message).join("; ") || "no error detail returned";
  if (errors.some((e) => SCHEMA_DRIFT_CODES.has(String(e.extensions?.code ?? "")))) {
    return `${operation}: ${detail}. ${SCHEMA_DRIFT_HINT}`;
  }
  if (kind === "unauthenticated") return `${operation}: not signed in. ${AUTH_HINT}`;
  if (kind === "forbidden" && !signedIn) {
    return `${operation}: not signed in, and this is private or needs an account. ${detail}. ${AUTH_HINT}`;
  }
  if (kind === "forbidden") return `${operation}: signed in, but this account cannot access that. ${detail}`;
  if (kind === "rate_limited") return `${operation}: rate limited by cosmos.so. Retry in a moment.`;
  return `${operation}: ${detail}`;
}

export { AUTH_HINT };
