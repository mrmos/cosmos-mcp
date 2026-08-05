# Contributing

Bug reports and pull requests are welcome. Keep changes small and explain what you
observed.

```bash
bun install
bun test
bun run typecheck
bun run build
```

CI runs all four on every push and pull request. The tests that hit the live API are
gated behind `COSMOS_LIVE_TESTS=1` and never run in CI.

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
2. Register the tool in the matching `src/tools/*.ts` module — `account.ts`, `browse.ts`
   or `curate.ts` — using the helpers in `src/tools/kit.ts`. Use `guard()` so a
   rejection cannot kill the stdio transport, `ok()`/`fail()` for results, and the
   shared `cursorArg`/`limitArg` so paging behaves the same everywhere.
3. Normalise the response in `src/normalize.ts`. Tools should return flat, small shapes.
   Raw API payloads are large and full of `__typename`.
4. Write the tool description for an agent, not a human. Say when to reach for it and
   what to reach for instead.
5. Add it to the right table in the README, in the "works without auth" or "needs auth"
   section.
6. Add a test. Mock the transport; do not add a test that needs a cookie.

## Style

- Bun, not Node or npm, for all tooling. See `CLAUDE.md`.
- Comments explain why, not what.
- Errors are written to be read by an agent that has to decide what to do next.
