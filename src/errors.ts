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
  "Set COSMOS_COOKIE to the `Cookie` header from a signed-in cosmos.so browser " +
  "session (DevTools > Network > any api.cosmos.so request > Request Headers). " +
  "Browsing and search work without it; saving and collections do not.";

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

/** Builds the user-facing message for a set of GraphQL errors. */
export function describe(kind: CosmosErrorKind, errors: CosmosGraphQLError[], operation: string): string {
  const detail = errors.map((e) => e.message).join("; ") || "no error detail returned";
  if (kind === "unauthenticated") return `${operation}: not signed in. ${AUTH_HINT}`;
  if (kind === "forbidden") return `${operation}: signed in, but this account cannot access that. ${detail}`;
  if (kind === "rate_limited") return `${operation}: rate limited by cosmos.so. Retry in a moment.`;
  return `${operation}: ${detail}`;
}

export { AUTH_HINT };
