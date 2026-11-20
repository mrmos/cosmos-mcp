# Contributing

Bug reports and pull requests are welcome. Keep changes small and explain what you
observed.

You need [Bun](https://bun.com).

```bash
bun install          # install dependencies
bun run dev          # run the server from source, restarting on change
bun test             # run tests
bun run typecheck    # tsc --noEmit
bun run build        # bundle to dist/index.js for Node
bun run build:mcpb   # build the Claude Desktop extension
```

CI runs install, test, typecheck and build on every push and pull request. The tests
that hit the live API are gated behind `COSMOS_LIVE_TESTS=1` and never run in CI.

## Running from a clone

Point your MCP client at the source. Use an absolute path, because MCP clients do not
always resolve relative paths:

```bash
claude mcp add cosmos -- bun run /absolute/path/to/cosmos-mcp/index.ts serve
```

A clone reads `.env`, so you can leave `env` out of the client configuration. Inside the
clone, `npx cosmos-mcp` fails with `command not found`, because npx finds the unbuilt
local package. Use `bun run index.ts login` and the like instead.

The server speaks MCP over stdio. Any output on stdout that is not a JSON-RPC frame
breaks the protocol, so write logs to stderr. To smoke-test the built file:

```bash
bun run build
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}\n' \
  | node dist/index.js serve
```

It prints `cosmos-mcp ready on stdio` on stderr and a JSON-RPC result with `serverInfo`
on stdout.

## Project layout

```
index.ts                 entrypoint: CLI subcommands, else stdio transport
src/
  cli.ts                 login, logout, status, help
  auth-store.ts          the credential file `login` writes
  config.ts              environment, .env and stored credential to CosmosConfig
  errors.ts              CosmosError, and the mapping from GraphQL codes to kinds
  normalize.ts           API shapes to the flatter shapes tools return
  server.ts              McpServer construction and tool registration
  prompts.ts             the moodboard prompt
  graphql/
    client.ts            HTTP client, auth headers, viewer resolution
    fragments.ts         shared GraphQL fragments
  tools/
    kit.ts               shared helpers: ok/fail/refuse/guard, common arguments
    account.ts           whoami, library, feed, activity
    browse.ts            search, explore, elements, users, clusters
    curate.ts            create, save, organize
    manage.ts            save URLs, update, nest, delete, follow, pin
    catalog.ts           which tools need sign-in
scripts/
  probe-schema.ts        schema discovery against the live API
  build-mcpb.ts          builds the Claude Desktop extension
  demo/                  records docs/demo.gif
mcpb/manifest.json       Claude Desktop extension manifest
server.json              MCP registry entry
docs/
  har-ops/               reverse-engineered GraphQL operation reference
test/
```

## Recording the demo GIF

`docs/demo.gif` replays real tool output, recorded signed in because Cosmos personalizes
results. Its images are not public domain. `render.ts` needs Google Chrome and ffmpeg.
Sign in first with `bun run index.ts login`.

```bash
bun run build
bun run scripts/demo/capture.ts && bun run scripts/demo/render.ts
```

Pass other queries as arguments, for example
`bun run scripts/demo/capture.ts "warm brutalist interiors"`.

## Where the schema came from

Cosmos publishes no API, no schema and no documentation. GraphQL introspection is
disabled on `api.cosmos.so`. Everything this server knows was reverse-engineered.

The operation definitions in `docs/har-ops/` were lifted from a HAR capture of a
signed-in cosmos.so browser session: every distinct GraphQL operation the web app sent,
with its query text and a sample response. `scripts/probe-schema.ts` filled the rest in.

Two consequences you should hold in mind:

1. **The schema is a guess.** It covers what the web app happens to use, at one moment,
   for one account. Fields we never saw exercised may exist. Fields we did see may be
   nullable in cases the capture never hit.
2. **Never commit a HAR.** A HAR of an authenticated session contains the session cookie
   in plaintext, plus every response body. `*.har` is in `.gitignore`. If you capture
   one to investigate something, keep it out of the repo and delete it when you are
   done.

## Verifying a GraphQL operation

You do not need to sign in to check whether a query is valid. The server validates the
document before it checks authentication, and it returns validation errors alongside the
auth error. That is enough to confirm a query without ever sending a credential.

Send the operation unauthenticated and read the error codes:

| What you get back | What it means |
| --- | --- |
| HTTP 401, one error, code `AUTHENTICATION` | The query is **valid**. Every field and argument resolved. It just needs a session. |
| HTTP 400, code `FIELDS_ON_CORRECT_TYPE` | A field does not exist. The message names the parent type, and often suggests the right field. |
| HTTP 400, code `UNKNOWN_ARGUMENT` | The argument name is wrong. The message usually lists the valid ones. |
| HTTP 400, code `ARGUMENTS_OF_CORRECT_TYPE` | The argument exists but the value or shape is wrong. The message lists required fields. |
| HTTP 400, code `PROVIDED_REQUIRED_ARGUMENTS` | A required argument is missing. The message names its type. |
| HTTP 400, code `UNKNOWN_TYPE` or `VARIABLES_ARE_INPUT_TYPES` | A named type in the variable definitions does not exist. |

So the loop is: write the query, fire it unauthenticated, and keep going until the only
error left is `AUTHENTICATION`. At that point the shape is right and you can wire it up.

### The trap: a clean 401 does not validate your variable *values*

Only static validation runs before the auth check. Variable coercion does not. So this
returns a clean, misleading `AUTHENTICATION`-only 401 even though `zzzBogus` is not a
real field:

```jsonc
// variables — NOT checked before auth
{ "filters": { "zzzBogus": true } }
```

while the same garbage written as a literal in the query text correctly fails with
`ARGUMENTS_OF_CORRECT_TYPE`:

```graphql
allElementsV2(filters: {zzzBogus: true})   # this one is checked
```

**To validate an input object, inline it as a literal.** A wrong field name then returns
`Unknown field`, and a field that exists but is mistyped returns `Expected type 'X'` —
which is also how you discover an undocumented input type's shape. Batching ~20 guessed
field names into one literal returns a verdict on all of them at once.

Validate both ways. The variables form proves the document parses; the literal form
proves the input shape is real.

`scripts/probe-schema.ts` automates this. It runs batches of probes, classifies the
responses by the table above, and prints a verdict per probe:

```bash
bun run scripts/probe-schema.ts              # every round
bun run scripts/probe-schema.ts someRound    # one round
PROBE_DELAY=250 bun run scripts/probe-schema.ts
```

Be considerate. Raise `PROBE_DELAY` rather than hammering the endpoint, and do not leave
a probe running in a loop.

## Adding a tool

1. Confirm the operation with the probe technique above. Add its query and a sample
   response under `docs/har-ops/`.
2. Register the tool in the matching `src/tools/*.ts` module (`account.ts`, `browse.ts`,
   `curate.ts` or `manage.ts`), using the helpers in `src/tools/kit.ts`. Use `guard()` so
   a rejection cannot kill the stdio transport, `ok()`/`fail()` for results, `refuse()`
   when the tool declines a call, and the shared `cursorArg`/`limitArg` so paging behaves
   the same everywhere.
3. Add the tool name to `src/tools/catalog.ts`, as signed out or signed in only. A test
   fails if a registered tool is missing from it.
4. Normalize the response in `src/normalize.ts`. Tools should return flat, small shapes.
   Raw API payloads are large and full of `__typename`.
5. Write the tool description for an agent, not a human. Say when to reach for it and
   what to reach for instead.
6. Add it to the right table in the README, with "Yes" in the Sign-in column if it needs
   a credential. Update the tool count at the top of the README Tools section. A test
   checks it.
7. Add a test. Mock the transport; do not add a test that needs a cookie.

## Releasing

Run `npm version patch && git push --follow-tags`. The publish workflow then:

1. Publishes the package to npm.
2. Builds `cosmos-mcp-<version>.mcpb` and attaches it to a GitHub release.
3. Copies the version into `server.json` and publishes it to the MCP registry.

## Style

- Bun, not Node or npm, for all tooling. See `CLAUDE.md`.
- Comments explain why, not what.
- Errors are written to be read by an agent that has to decide what to do next.
