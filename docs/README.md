# docs

## `har-ops/`

One Markdown file per GraphQL operation the cosmos.so web app sends. Each holds the
endpoint URL, the query document with its fragments, and notes on the response shape.
These files are the reference this server was built against.

They came out of a HAR capture. A browser was signed in to cosmos.so, DevTools recorded
the network traffic while the app was used normally, and each distinct GraphQL operation
in that capture was written out here by hand.

The HAR itself is not in this repository and must never be. It contains the session
cookie in plaintext and the full body of every response. `*.har` is in `.gitignore`.

### They have been scrubbed

The capture came from a real signed-in account, so these files originally held that
account's user id, its private collection names, and the usernames of everyone whose
work appeared in the feed. All of it was replaced with neutral placeholders
(`example-user`, `100000001`) before the first commit, and the verbatim response dumps
were dropped entirely — the response *shape* sections above them carry the useful
information without the personal data.

So the values here are illustrative, not real. Do not treat any id in these files as a
live one to test against.

### What these files are not

- **Not a schema.** Cosmos disables GraphQL introspection. This is a record of what one
  client sent, not a description of what the server accepts. Fields absent here may
  exist. Fields present here may have looser or tighter nullability than the capture
  suggests.
- **Not stable.** `api.cosmos.so` is a private API. Nothing here is promised by anyone.
  When the web app changes, these files go stale silently.
- **Not exhaustive.** They cover the operations one account triggered in one session.

Treat them as evidence, not as documentation.

### Keeping them honest

Before relying on an operation here, confirm it against the live API. The unauthenticated
probe described in [CONTRIBUTING.md](../CONTRIBUTING.md) tells you whether a query still
validates without sending any credential: if the only error left is `AUTHENTICATION`, the
document is good. `scripts/probe-schema.ts` runs that check in batches.

When you correct a file, say what you observed and when. These are notes on a moving
target.
