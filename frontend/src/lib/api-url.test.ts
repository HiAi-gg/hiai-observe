import { describe, expect, it } from "vitest";
import { joinApiUrl, normalizeAppBase, normalizeOrigin } from "./api-url";

describe("normalizeAppBase", () => {
  it("treats Vite relative bases as no prefix", () => {
    expect(normalizeAppBase(undefined)).toBe("");
    expect(normalizeAppBase("")).toBe("");
    expect(normalizeAppBase(".")).toBe("");
    expect(normalizeAppBase("./")).toBe("");
    expect(normalizeAppBase("/")).toBe("");
  });

  it("keeps a real kit.paths.base prefix", () => {
    expect(normalizeAppBase("/hiai-observe")).toBe("/hiai-observe");
    expect(normalizeAppBase("/hiai-observe/")).toBe("/hiai-observe");
  });
});

describe("normalizeOrigin", () => {
  it("strips a literal dot after the port", () => {
    expect(normalizeOrigin("https://infra-01.tail31e57b.ts.net:8449.")).toBe(
      "https://infra-01.tail31e57b.ts.net:8449",
    );
  });

  it("strips a trailing slash", () => {
    expect(normalizeOrigin("https://infra-01.tail31e57b.ts.net:8449/")).toBe(
      "https://infra-01.tail31e57b.ts.net:8449",
    );
  });
});

describe("joinApiUrl", () => {
  const tailnet = "https://infra-01.tail31e57b.ts.net:8449";

  it("uses same-origin /api/dashboard when Vite base is ./", () => {
    const url = joinApiUrl("/api/dashboard", { appBase: "./" });
    expect(url).toBe("/api/dashboard");
    expect(url).not.toContain("8449.");
    expect(() => new URL(url, `${tailnet}/`)).not.toThrow();
    expect(new URL(url, `${tailnet}/`).href).toBe(`${tailnet}/api/dashboard`);
  });

  it("never emits origin+./ which fetch cannot parse", () => {
    const broken = `${tailnet}${"./".replace(/\/$/, "")}/api/dashboard?`;
    expect(broken).toBe(`${tailnet}./api/dashboard?`);
    expect(() => new URL(broken)).toThrow();

    const fixed = joinApiUrl("/api/dashboard?", { appBase: "./" });
    expect(fixed).toBe("/api/dashboard");
    expect(() => new URL(fixed, `${tailnet}/`)).not.toThrow();
  });

  it("prefixes LAN kit.paths.base", () => {
    expect(joinApiUrl("/api/issues", { appBase: "/hiai-observe/" })).toBe(
      "/hiai-observe/api/issues",
    );
  });

  it("drops a trailing empty query", () => {
    expect(joinApiUrl("/api/dashboard?")).toBe("/api/dashboard");
  });

  it("keeps real query strings", () => {
    expect(joinApiUrl("/api/dashboard?projectId=p1")).toBe("/api/dashboard?projectId=p1");
  });

  it("builds a clean absolute URL when asked", () => {
    const url = joinApiUrl("/api/dashboard", {
      appBase: "./",
      origin: `${tailnet}.`,
      absolute: true,
    });
    expect(url).toBe(`${tailnet}/api/dashboard`);
    expect(() => new URL(url)).not.toThrow();
  });
});
