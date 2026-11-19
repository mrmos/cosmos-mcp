import { expect, test } from "bun:test";
import { describe as describeError } from "../src/errors";
import { moodboardPromptText } from "../src/prompts";

test("a schema mismatch tells the agent to update the server, not to retry", () => {
  const msg = describeError(
    "validation",
    [{ message: "Cannot query field 'x' on type 'Cluster'", extensions: { code: "FIELDS_ON_CORRECT_TYPE" } }],
    "CosmosMcpThing",
  );
  expect(msg).toContain("npx -y cosmos-mcp@latest");
});

test("an ordinary input error gets no update hint", () => {
  const msg = describeError("validation", [{ message: "Bad id", extensions: { code: "BAD_USER_INPUT" } }], "Op");
  expect(msg).not.toContain("cosmos-mcp@latest");
});

test("the moodboard prompt saves only when asked, and never asks for a token in chat", () => {
  const saving = moodboardPromptText("warm brutalist interiors", true, "Warm Brutalism");
  expect(saving).toContain("cosmos_create_cluster");
  expect(saving).toContain('"Warm Brutalism"');
  expect(saving).toContain("npx cosmos-mcp login");

  const browsing = moodboardPromptText("warm brutalist interiors", false);
  expect(browsing).not.toContain("cosmos_create_cluster");
  expect(browsing).toContain("Do not save");
});
