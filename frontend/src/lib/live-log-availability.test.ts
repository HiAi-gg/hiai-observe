import { describe, expect, it } from "vitest";
import { liveLogUnsupportedReason } from "./live-log-availability";

describe("live log transport availability", () => {
  it("explains that cookie-backed sessions do not have a scoped live transport", () => {
    expect(liveLogUnsupportedReason({ hasApiKey: false, selectedProject: "" })).toContain(
      "cookie-backed sessions",
    );
  });

  it("explains that selected-project views do not use the global live transport", () => {
    expect(liveLogUnsupportedReason({ hasApiKey: true, selectedProject: "project-a" })).toContain(
      "selected-project views",
    );
  });

  it("allows the existing explicitly global API-key transport", () => {
    expect(liveLogUnsupportedReason({ hasApiKey: true, selectedProject: "" })).toBeNull();
  });
});
