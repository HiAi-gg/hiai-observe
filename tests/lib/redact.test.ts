import { describe, expect, it } from "vitest";
import { redactDeep, redactSecrets } from "../../src/lib/redact.js";

describe("redactSecrets", () => {
  it("replaces bearer tokens without dropping the surrounding text", () => {
    const out = redactSecrets("Authorization: Bearer ho_abc123def4567890 extra");
    expect(out).toContain("[redacted]");
    expect(out).toContain("extra");
    expect(out).not.toContain("ho_abc123def4567890");
  });

  it("redacts passwords inside connection strings", () => {
    const out = redactSecrets("db=postgresql://observe:s3cret-pass@127.0.0.1:5432/app");
    expect(out).toContain("postgresql://observe:[redacted]@127.0.0.1:5432/app");
    expect(out).not.toContain("s3cret-pass");
  });

  it("redacts password= assignments", () => {
    const out = redactSecrets("login failed password=hunter2 for user");
    expect(out).toContain("password=[redacted]");
    expect(out).not.toContain("hunter2");
  });

  it("redacts JWT-shaped tokens", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.signaturepartxx";
    const out = redactSecrets(`token ${jwt} ok`);
    expect(out).toContain("[redacted]");
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
  });

  it("leaves ordinary log lines unchanged", () => {
    const line = "GET /api/issues 200 12ms";
    expect(redactSecrets(line)).toBe(line);
  });
});

describe("redactDeep", () => {
  it("walks nested objects and arrays", () => {
    const out = redactDeep({
      message: "api_key=sk-live-abcdefghijklmnopqrstuv",
      nested: [{ body: "Bearer supersecretvalue123456" }],
    }) as { message: string; nested: Array<{ body: string }> };
    expect(out.message).toContain("[redacted]");
    expect(out.message).not.toContain("sk-live-abcdefghijklmnopqrstuv");
    expect(out.nested[0]?.body).toContain("[redacted]");
    expect(out.nested[0]?.body).not.toContain("supersecretvalue123456");
  });
});
