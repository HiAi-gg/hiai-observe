import { describe, expect, it } from "vitest";
import { parseDockerLogFrame, parseRawLogLine } from "../../src/monitoring/log-streamer.js";

describe("parseDockerLogFrame", () => {
  it("parses a stdout frame correctly", () => {
    const message = "hello world";
    const header = Buffer.alloc(8);
    header[0] = 1; // stdout
    header.writeUInt32BE(message.length, 4);

    const buffer = Buffer.concat([header, Buffer.from(message)]);
    const result = parseDockerLogFrame(buffer);

    expect(result).toEqual({ stream: "stdout", payload: "hello world" });
  });

  it("parses a stderr frame correctly", () => {
    const message = "error message";
    const header = Buffer.alloc(8);
    header[0] = 2; // stderr
    header.writeUInt32BE(message.length, 4);

    const buffer = Buffer.concat([header, Buffer.from(message)]);
    const result = parseDockerLogFrame(buffer);

    expect(result).toEqual({ stream: "stderr", payload: "error message" });
  });

  it("returns null when buffer is too small for header", () => {
    const buffer = Buffer.alloc(4);
    expect(parseDockerLogFrame(buffer)).toBeNull();
  });

  it("returns null when buffer is too small for payload", () => {
    const header = Buffer.alloc(8);
    header[0] = 1;
    header.writeUInt32BE(100, 4); // claims 100 bytes payload

    const buffer = Buffer.concat([header, Buffer.from("short")]);
    expect(parseDockerLogFrame(buffer)).toBeNull();
  });
});

describe("parseRawLogLine", () => {
  it("parses timestamped line", () => {
    const result = parseRawLogLine("2026-05-22T10:00:00.123456789Z hello world");
    expect(result.timestamp).toBe("2026-05-22T10:00:00.123456789Z");
    expect(result.message).toBe("hello world");
  });

  it("handles line without timestamp", () => {
    const result = parseRawLogLine("no timestamp here");
    expect(result.message).toBe("no timestamp here");
    expect(result.timestamp).toBeTruthy(); // uses current time
  });

  it("handles empty message after timestamp", () => {
    const result = parseRawLogLine("2026-05-22T10:00:00Z ");
    expect(result.timestamp).toBe("2026-05-22T10:00:00Z");
    expect(result.message).toBe("");
  });
});
