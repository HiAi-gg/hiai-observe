/**
 * HIAI-OBSERVE-T02: traces and logs are distinct tables. Correlation is an
 * optional `logs.trace_id` / `logs.span_id` link, not a merged schema.
 */

import { describe, expect, it } from "vitest";
import { logs, traces } from "../../src/store/schema.js";

describe("trace schema vs log schema", () => {
  it("keeps traces.trace_id / span_id required on the traces table", () => {
    expect(traces.traceId.name).toBe("trace_id");
    expect(traces.spanId.name).toBe("span_id");
    expect(traces.traceId.notNull).toBe(true);
    expect(traces.spanId.notNull).toBe(true);
    expect(traces.name.name).toBe("name");
  });

  it("adds optional logs.trace_id / span_id without requiring them", () => {
    expect(logs.traceId.name).toBe("trace_id");
    expect(logs.spanId.name).toBe("span_id");
    expect(logs.traceId.notNull).toBe(false);
    expect(logs.spanId.notNull).toBe(false);
    expect(logs.message.name).toBe("message");
    expect(logs.raw.name).toBe("raw");
  });

  it("does not treat logs as a traces table", () => {
    expect(logs).not.toBe(traces);
    expect("tokenUsage" in traces).toBe(true);
    expect("tokenUsage" in logs).toBe(false);
    expect("containerId" in logs).toBe(true);
    expect("containerId" in traces).toBe(false);
  });
});
