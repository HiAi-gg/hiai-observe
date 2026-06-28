import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  debounce,
  formatBytes,
  formatDuration,
  highlightJson,
  isJson,
  isStackTrace,
  stripAnsi,
  timeAgo,
} from "./utils";

describe("utils", () => {
  // --- timeAgo ---

  describe("timeAgo", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-25T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns seconds for < 60s ago", () => {
      expect(timeAgo("2026-05-25T11:59:30Z")).toBe("30s ago");
    });

    it("returns '0s ago' for now", () => {
      expect(timeAgo("2026-05-25T12:00:00Z")).toBe("0s ago");
    });

    it("returns minutes for < 1h ago", () => {
      expect(timeAgo("2026-05-25T11:55:00Z")).toBe("5m ago");
    });

    it("returns 59m for 59 minutes ago", () => {
      expect(timeAgo("2026-05-25T11:01:00Z")).toBe("59m ago");
    });

    it("returns hours for < 24h ago", () => {
      expect(timeAgo("2026-05-25T08:00:00Z")).toBe("4h ago");
    });

    it("returns 23h for 23 hours ago", () => {
      expect(timeAgo("2026-05-24T13:00:00Z")).toBe("23h ago");
    });

    it("returns days for >= 24h ago", () => {
      expect(timeAgo("2026-05-22T12:00:00Z")).toBe("3d ago");
    });

    it("returns 1d for exactly 24h ago", () => {
      expect(timeAgo("2026-05-24T12:00:00Z")).toBe("1d ago");
    });

    it("handles large time differences", () => {
      expect(timeAgo("2026-01-01T00:00:00Z")).toBe("144d ago");
    });
  });

  // --- formatBytes ---

  describe("formatBytes", () => {
    it("returns bytes for < 1024", () => {
      expect(formatBytes(0)).toBe("0 B");
      expect(formatBytes(512)).toBe("512 B");
      expect(formatBytes(1023)).toBe("1023 B");
    });

    it("returns KB for < 1MB", () => {
      expect(formatBytes(1024)).toBe("1.0 KB");
      expect(formatBytes(1536)).toBe("1.5 KB");
      expect(formatBytes(1024 * 1023)).toBe("1023.0 KB");
    });

    it("returns MB for < 1GB", () => {
      expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
      expect(formatBytes(1024 * 1024 * 5.5)).toBe("5.5 MB");
    });

    it("returns GB for >= 1GB", () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
      expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe("2.5 GB");
    });
  });

  // --- formatDuration ---

  describe("formatDuration", () => {
    it("returns ms for < 1000ms", () => {
      expect(formatDuration(0)).toBe("0ms");
      expect(formatDuration(500)).toBe("500ms");
      expect(formatDuration(999)).toBe("999ms");
    });

    it("returns seconds for < 60s", () => {
      expect(formatDuration(1000)).toBe("1.0s");
      expect(formatDuration(1500)).toBe("1.5s");
      expect(formatDuration(30000)).toBe("30.0s");
      expect(formatDuration(59999)).toBe("60.0s"); // 59999/1000 = 59.999, toFixed(1) = "60.0"
    });

    it("returns minutes for >= 60s", () => {
      expect(formatDuration(60000)).toBe("1.0m");
      expect(formatDuration(90000)).toBe("1.5m");
      expect(formatDuration(300000)).toBe("5.0m");
    });
  });

  // --- stripAnsi ---

  describe("stripAnsi", () => {
    it("returns plain text unchanged", () => {
      expect(stripAnsi("hello world")).toBe("hello world");
    });

    it("strips basic color codes", () => {
      expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red");
    });

    it("strips multiple codes", () => {
      expect(stripAnsi("\x1b[1;32mbold green\x1b[0m")).toBe("bold green");
    });

    it("strips 256-color codes", () => {
      expect(stripAnsi("\x1b[38;5;196mred256\x1b[0m")).toBe("red256");
    });

    it("strips RGB color codes", () => {
      expect(stripAnsi("\x1b[38;2;255;0;0mredRGB\x1b[0m")).toBe("redRGB");
    });

    it("strips background codes", () => {
      expect(stripAnsi("\x1b[44mblue bg\x1b[0m")).toBe("blue bg");
    });

    it("strips cursor and erase sequences", () => {
      expect(stripAnsi("\x1b[2J\x1b[H")).toBe("");
    });

    it("handles string with no ANSI codes", () => {
      const text = "This is a normal log message with no special characters.";
      expect(stripAnsi(text)).toBe(text);
    });

    it("handles empty string", () => {
      expect(stripAnsi("")).toBe("");
    });

    it("strips codes from mixed content", () => {
      const input = "Start \x1b[31mred\x1b[0m middle \x1b[1;34mbold blue\x1b[0m end";
      expect(stripAnsi(input)).toBe("Start red middle bold blue end");
    });
  });

  // --- isJson ---

  describe("isJson", () => {
    it("returns true for valid JSON object", () => {
      expect(isJson('{"key": "value"}')).toBe(true);
    });

    it("returns true for valid JSON array", () => {
      expect(isJson("[1, 2, 3]")).toBe(true);
    });

    it("returns true for nested objects", () => {
      expect(isJson('{"a": {"b": 1}}')).toBe(true);
    });

    it("returns true for empty object", () => {
      expect(isJson("{}")).toBe(true);
    });

    it("returns true for empty array", () => {
      expect(isJson("[]")).toBe(true);
    });

    it("returns false for plain text", () => {
      expect(isJson("hello world")).toBe(false);
    });

    it("returns false for numbers", () => {
      expect(isJson("42")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isJson("")).toBe(false);
    });

    it("returns false for null/undefined input", () => {
      expect(isJson(null as unknown as string)).toBe(false);
      expect(isJson(undefined as unknown as string)).toBe(false);
    });

    it("returns true for object with leading whitespace", () => {
      expect(isJson('  {"key": "value"}')).toBe(true);
    });

    it("returns false for string that starts with { but doesn't end with }", () => {
      expect(isJson("{not json")).toBe(false);
    });
  });

  // --- highlightJson ---

  describe("highlightJson", () => {
    it("returns stringified value for null", () => {
      // JSON.stringify(null) returns "null"
      expect(highlightJson(null)).toBe("null");
    });

    it("returns empty string for undefined", () => {
      // JSON.stringify(undefined) returns undefined, which becomes ""
      expect(highlightJson(undefined)).toBe("");
    });

    it("highlights keys", () => {
      const result = highlightJson({ name: "test" });
      expect(result).toContain("text-[var(--primary)]");
      expect(result).toContain('"name"');
    });

    it("highlights string values", () => {
      const result = highlightJson({ name: "test" });
      expect(result).toContain("text-[var(--success)]");
      expect(result).toContain('"test"');
    });

    it("highlights numbers", () => {
      const result = highlightJson({ count: 42 });
      expect(result).toContain("text-[var(--warning)]");
      expect(result).toContain("42");
    });

    it("highlights booleans and null", () => {
      const result = highlightJson({ active: true, deleted: false, extra: null });
      expect(result).toContain("text-[var(--violet)]");
      expect(result).toContain("true");
      expect(result).toContain("false");
      expect(result).toContain("null");
    });

    it("escapes HTML entities", () => {
      const result = highlightJson({ html: "<div>&amp;</div>" });
      expect(result).toContain("&lt;");
      expect(result).toContain("&amp;");
      expect(result).not.toContain("<div>");
    });
  });

  // --- isStackTrace ---

  describe("isStackTrace", () => {
    it("returns true for Node/Bun stack traces", () => {
      const trace = `TypeError: Cannot read property 'x' of undefined
    at Object.<anonymous> (/app/src/index.ts:10:5)
    at Module._compile (node:internal/modules/cjs:1198:14)`;
      expect(isStackTrace(trace)).toBe(true);
    });

    it("returns true for Python stack traces", () => {
      const trace = `Traceback (most recent call last):
  File "/app/main.py", line 10, in <module>
    result = 1 / 0
ZeroDivisionError: division by zero`;
      expect(isStackTrace(trace)).toBe(true);
    });

    it("returns true for Python nested traces", () => {
      const trace = `Traceback (most recent call last):
  File "/app/main.py", line 5, in foo
  File "/app/utils.py", line 10, in bar
ValueError: bad value`;
      expect(isStackTrace(trace)).toBe(true);
    });

    it("returns true for ERROR prefix with stack", () => {
      const trace = `[ERROR] Something failed
[ERROR] Another error line`;
      expect(isStackTrace(trace)).toBe(true);
    });

    it("returns false for single line", () => {
      expect(isStackTrace("Error: something went wrong")).toBe(false);
    });

    it("returns false for plain multiline text", () => {
      expect(isStackTrace("Line 1\nLine 2\nLine 3")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isStackTrace("")).toBe(false);
    });

    it("returns false for single stack frame (needs >= 2 matching lines)", () => {
      const trace = `Some context
    at Object.<anonymous> (/app/index.ts:10:5)
More context`;
      expect(isStackTrace(trace)).toBe(false);
    });
  });

  // --- debounce ---

  describe("debounce", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("delays function execution", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("resets timer on subsequent calls", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      vi.advanceTimersByTime(50);
      debounced();
      vi.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("passes arguments to the debounced function", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced("a", "b");
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith("a", "b");
    });

    it("only fires once for rapid calls", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      debounced();
      debounced();
      debounced();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
