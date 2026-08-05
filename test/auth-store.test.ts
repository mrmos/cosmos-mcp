import { test, expect, afterEach } from "bun:test";
import { mkdtempSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearAuth, configPath, readAuth, redact, writeAuth } from "../src/auth-store";
import { loadConfig } from "../src/config";

const dirs: string[] = [];

/** An isolated config home, so tests never touch the real ~/.config. */
function sandbox(): NodeJS.ProcessEnv {
  const dir = mkdtempSync(join(tmpdir(), "cosmos-mcp-test-"));
  dirs.push(dir);
  return { XDG_CONFIG_HOME: dir };
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

test("round-trips a credential", () => {
  const env = sandbox();
  writeAuth({ cookie: "a=1; b=2", userId: 7, username: "someone" }, env);

  const read = readAuth(env);
  expect(read.cookie).toBe("a=1; b=2");
  expect(read.userId).toBe(7);
  expect(read.username).toBe("someone");
  expect(read.savedAt).toBeTruthy();
});

test("writes the file owner-only", () => {
  const env = sandbox();
  writeAuth({ cookie: "a=1" }, env);
  // 0o600 — no group or other bits. This file holds a session credential.
  expect(statSync(configPath(env)).mode & 0o077).toBe(0);
});

test("re-tightens permissions on an existing loose file", () => {
  const env = sandbox();
  mkdirSync(join(env.XDG_CONFIG_HOME!, "cosmos-mcp"), { recursive: true });
  writeFileSync(configPath(env), "{}", { mode: 0o644 });

  writeAuth({ cookie: "a=1" }, env);
  expect(statSync(configPath(env)).mode & 0o077).toBe(0);
});

test("a missing or corrupt file reads as no credential, never throws", () => {
  const env = sandbox();
  expect(readAuth(env)).toEqual({});

  mkdirSync(join(env.XDG_CONFIG_HOME!, "cosmos-mcp"), { recursive: true });
  writeFileSync(configPath(env), "{ this is not json");
  expect(readAuth(env)).toEqual({});

  writeFileSync(configPath(env), '"a string, not an object"');
  expect(readAuth(env)).toEqual({});
});

test("clearAuth removes the file and reports honestly when there is none", () => {
  const env = sandbox();
  expect(clearAuth(env)).toBe(false);

  writeAuth({ cookie: "a=1" }, env);
  expect(clearAuth(env)).toBe(true);
  expect(readAuth(env)).toEqual({});
});

test("redact never returns anything reusable", () => {
  const secret = "session=supersecretvalue123456789";
  const shown = redact(secret);

  expect(shown).not.toContain("supersecret");
  expect(shown).toContain("chars");
  expect(redact(undefined)).toBe("(none)");
});

test("an environment variable beats the stored credential", () => {
  const env = sandbox();
  writeAuth({ cookie: "stored=1", userId: 111 }, env);

  const config = loadConfig({ ...env, COSMOS_COOKIE: "fromenv=1" });
  expect(config.cookie).toBe("fromenv=1");
});

test("the stored credential is used when nothing higher-precedence is set", () => {
  const env = sandbox();
  writeAuth({ cookie: "stored=1", userId: 111 }, env);

  // A developer's own `.env` outranks the stored credential by design, so this
  // assertion only holds when there is no local `.env` cookie to beat it.
  const hasDotEnvCookie = Boolean(loadConfig({ XDG_CONFIG_HOME: "/nonexistent" }).cookie);
  if (hasDotEnvCookie) {
    expect(loadConfig(env).cookie).not.toBe(undefined);
    return;
  }

  const config = loadConfig(env);
  expect(config.cookie).toBe("stored=1");
  expect(config.userId).toBe(111);
});
