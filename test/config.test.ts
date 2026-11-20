import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../src/auth-store";
import { loadConfig, normalizeAuthorization } from "../src/config";

const dirs: string[] = [];
function sandbox(): NodeJS.ProcessEnv {
  const dir = mkdtempSync(join(tmpdir(), "cosmos-mcp-config-"));
  dirs.push(dir);
  return { XDG_CONFIG_HOME: dir };
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const hasDotEnvCredential = loadConfig({ XDG_CONFIG_HOME: "/nonexistent" }).credentialSource === "dotenv";

test("a bare JWT gets its Bearer prefix; a full header is left alone", () => {
  expect(normalizeAuthorization("aaa.bbb.ccc")).toBe("Bearer aaa.bbb.ccc");
  expect(normalizeAuthorization("  Bearer aaa.bbb.ccc ")).toBe("Bearer aaa.bbb.ccc");
  expect(normalizeAuthorization("")).toBeUndefined();
  expect(loadConfig({ ...sandbox(), COSMOS_AUTHORIZATION: "aaa.bbb.ccc" }).authorization).toBe("Bearer aaa.bbb.ccc");
});

test("an env credential never borrows the stored account's user id", () => {
  const env = sandbox();
  writeAuth({ authorization: "Bearer stored", userId: 111, username: "account-a" }, env);

  const config = loadConfig({ ...env, COSMOS_AUTHORIZATION: "Bearer other-account" });
  expect(config.credentialSource).toBe("environment");
  expect(config.authorization).toBe("Bearer other-account");
  expect(config.userId).toBeUndefined();
  expect(config.username).toBeUndefined();
});

test("an env cookie is not paired with a stored token", () => {
  const env = sandbox();
  writeAuth({ authorization: "Bearer stored" }, env);
  const config = loadConfig({ ...env, COSMOS_COOKIE: "session=1" });
  expect(config.cookie).toBe("session=1");
  expect(config.authorization).toBeUndefined();
});

test("the stored credential brings its user id and username", () => {
  if (hasDotEnvCredential) return;
  const env = sandbox();
  writeAuth({ authorization: "Bearer stored", userId: 111, username: "account-a" }, env);
  const config = loadConfig(env);
  expect(config.credentialSource).toBe("stored");
  expect(config.userId).toBe(111);
  expect(config.username).toBe("account-a");
});

test("COSMOS_USER_ID cannot override the id saved with a login for another account", () => {
  if (hasDotEnvCredential) return;
  const env = sandbox();
  writeAuth({ authorization: "Bearer stored", userId: 111, username: "account-a" }, env);
  const config = loadConfig({ ...env, COSMOS_USER_ID: "222" });
  expect(config.credentialSource).toBe("stored");
  expect(config.userId).toBe(111);
  expect(config.username).toBe("account-a");
});

test("COSMOS_USER_ID applies beside an env credential", () => {
  const config = loadConfig({ ...sandbox(), COSMOS_AUTHORIZATION: "Bearer env", COSMOS_USER_ID: "222" });
  expect(config.credentialSource).toBe("environment");
  expect(config.userId).toBe(222);
});

test("an unfilled ${...} template from the MCP host is not a credential", () => {
  if (hasDotEnvCredential) return;
  const env = sandbox();
  writeAuth({ authorization: "Bearer stored", userId: 111 }, env);
  const config = loadConfig({ ...env, COSMOS_AUTHORIZATION: "${user_config.cosmos_authorization}" });
  expect(config.credentialSource).toBe("stored");
  expect(config.authorization).toBe("Bearer stored");
});

test("a malformed number falls back to the default instead of crashing start-up", () => {
  const config = loadConfig({ ...sandbox(), COSMOS_TIMEOUT_MS: "abc" });
  expect(config.timeoutMs).toBe(30_000);
});
