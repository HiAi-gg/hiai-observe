import { describe, expect, it } from "vitest";
import { assertSafeHttpUrl, isBlockedIp, SsrfError } from "../../src/lib/ssrf.js";

describe("isBlockedIp", () => {
  it("blocks loopback and RFC1918", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.0.0.1")).toBe(true);
    expect(isBlockedIp("192.168.1.1")).toBe(true);
    expect(isBlockedIp("172.16.0.1")).toBe(true);
    expect(isBlockedIp("169.254.169.254")).toBe(true);
    expect(isBlockedIp("::1")).toBe(true);
  });

  it("allows public unicast", () => {
    expect(isBlockedIp("1.1.1.1")).toBe(false);
    expect(isBlockedIp("8.8.8.8")).toBe(false);
  });
});

describe("assertSafeHttpUrl", () => {
  it("rejects non-http schemes", async () => {
    await expect(assertSafeHttpUrl("file:///etc/passwd")).rejects.toBeInstanceOf(SsrfError);
  });

  it("rejects localhost hostname", async () => {
    await expect(assertSafeHttpUrl("http://localhost/")).rejects.toBeInstanceOf(SsrfError);
  });

  it("rejects loopback literal", async () => {
    await expect(assertSafeHttpUrl("http://127.0.0.1/")).rejects.toBeInstanceOf(SsrfError);
  });
});
