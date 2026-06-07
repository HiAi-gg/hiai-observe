/**
 * Tests for ensureBootstrapProject()
 *
 * Bootstrap path: on startup, if HIAI_OBSERVE_API_KEY is set, the server must
 * ensure a project exists whose hashed key matches it — so a fresh
 * `docker compose up` with the env var configured is immediately usable.
 *
 * - empty/undefined key  -> no-op, never touches the DB
 * - key already resolves  -> no-op (idempotent), no duplicate project created
 * - key not yet present   -> creates an admin project with apiKeyHash + keyPrefix
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Bun.password used by hashApiKey / lookupProject
(globalThis as any).Bun = {
  password: {
    verify: vi.fn().mockResolvedValue(true),
    hash: vi.fn().mockResolvedValue("$2b$10$bootstraphash"),
  },
};

// Mock DB: select chain (for lookupProject) + insert chain (for create)
const selectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
};
const insertChain = {
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([{ id: "bootstrap-proj" }]),
};
vi.mock("../../src/store/db.js", () => ({
  db: {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
  },
}));

const { ensureBootstrapProject } = await import("../../src/lib/bootstrap.js");
const { db } = await import("../../src/store/db.js");

describe("ensureBootstrapProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectChain.limit.mockResolvedValue([]);
    insertChain.returning.mockResolvedValue([{ id: "bootstrap-proj" }]);
  });

  it("does nothing when no key is provided", async () => {
    const result = await ensureBootstrapProject(undefined);
    expect(result).toEqual({ created: false });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("does nothing when key is blank whitespace", async () => {
    const result = await ensureBootstrapProject("   ");
    expect(result).toEqual({ created: false });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("is idempotent when a project already authenticates with the key", async () => {
    // lookupProject finds a candidate whose hash verifies (Bun.password.verify -> true)
    selectChain.limit.mockResolvedValueOnce([{ id: "existing-proj", apiKeyHash: "$2b$10$x" }]);

    const result = await ensureBootstrapProject("ho_existingkey1234567890");

    expect(result).toEqual({ created: false, projectId: "existing-proj" });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("creates an admin project with hashed key + prefix when key is new", async () => {
    selectChain.limit.mockResolvedValue([]); // lookupProject finds nothing

    const result = await ensureBootstrapProject("ho_brandnewkey0987654321");

    expect(db.insert).toHaveBeenCalledTimes(1);
    const inserted = insertChain.values.mock.calls[0][0];
    expect(inserted.apiKeyHash).toBe("$2b$10$bootstraphash");
    expect(inserted.keyPrefix).toBe("ho_brand"); // first 8 chars
    expect(inserted.apiRole).toBe("admin");
    expect(inserted.apiKey).toBeUndefined(); // never store plaintext
    expect(result).toEqual({ created: true, projectId: "bootstrap-proj" });
  });
});
