import { test, expect } from "bun:test";
import { classifyCredential } from "../src/cli";

/**
 * Cosmos authenticates with a bearer token, not the cookie. The cookie on the
 * same request is AWS load-balancer stickiness (AWSALB/AWSALBCORS) and carries
 * no identity — pasting it was the whole reason an early login silently failed.
 */

test("a bare JWT becomes a Bearer authorization", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-DEF_123";
  expect(classifyCredential(jwt)).toEqual({ kind: "authorization", authorization: `Bearer ${jwt}` });
});

test('a "Bearer <jwt>" header is kept as-is', () => {
  const header = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-DEF_123";
  expect(classifyCredential(header)).toEqual({ kind: "authorization", authorization: header });
});

test("a leading/trailing whitespace does not defeat detection", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig";
  expect(classifyCredential(`  ${jwt}\n`)).toEqual({ kind: "authorization", authorization: `Bearer ${jwt}` });
});

test("the AWSALB load-balancer cookie alone is refused, not treated as a login", () => {
  // This is exactly what a user pasted from the Cookie header, and it must fail
  // with a clear message rather than a rejected round trip.
  const awsalb =
    "AWSALB=G1XZ+h6yDh+SS3S1SZph7Nsq1th2xcO5nbe8; AWSALBCORS=G1XZ+h6yDh+SS3S1SZph7Nsq1th2xcO5nbe8";
  expect(classifyCredential(awsalb)).toEqual({ kind: "unknown" });
});

test("a cookie header carrying a real session is still accepted", () => {
  const cookie = "cosmos_session=abc123; AWSALB=xyz; other=1";
  expect(classifyCredential(cookie)).toEqual({ kind: "cookie", cookie });
});

test("empty or junk input is unknown", () => {
  expect(classifyCredential("")).toEqual({ kind: "unknown" });
  expect(classifyCredential("   ")).toEqual({ kind: "unknown" });
  expect(classifyCredential("hello there")).toEqual({ kind: "unknown" });
  expect(classifyCredential("{json:true}")).toEqual({ kind: "unknown" });
});
