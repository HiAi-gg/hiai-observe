import { describe, it, expect } from "vitest";
import { parseAnsi, color256, ANSI_16, ANSI_16_BRIGHT } from "../ansi";

describe("AnsiText (parseAnsi + color256)", () => {
  // --- Plain text ---

  describe("plain text", () => {
    it("returns raw text as a single unstyled span when no ANSI codes present", () => {
      const spans = parseAnsi("hello world");
      expect(spans).toEqual([{ style: "", content: "hello world" }]);
    });

    it("returns empty array for empty string", () => {
      const spans = parseAnsi("");
      expect(spans).toEqual([]);
    });

    it("preserves whitespace in plain text", () => {
      const spans = parseAnsi("  spaces  ");
      expect(spans).toEqual([{ style: "", content: "  spaces  " }]);
    });
  });

  // --- Basic colors (30-37) ---

  describe("basic foreground colors", () => {
    it("applies red foreground (31)", () => {
      const spans = parseAnsi("\x1b[31mred\x1b[0m");
      expect(spans).toEqual([
        { style: "color:#cc0000", content: "red" },
      ]);
    });

    it("applies green foreground (32)", () => {
      const spans = parseAnsi("\x1b[32mgreen\x1b[0m");
      expect(spans).toEqual([
        { style: "color:#4e9a06", content: "green" },
      ]);
    });

    it("applies blue foreground (34)", () => {
      const spans = parseAnsi("\x1b[34mblue\x1b[0m");
      expect(spans).toEqual([
        { style: "color:#3465a4", content: "blue" },
      ]);
    });
  });

  // --- Basic background colors (40-47) ---

  describe("basic background colors", () => {
    it("applies red background (41)", () => {
      const spans = parseAnsi("\x1b[41mred bg\x1b[0m");
      expect(spans).toEqual([
        { style: "background-color:#cc0000", content: "red bg" },
      ]);
    });

    it("applies blue background (44)", () => {
      const spans = parseAnsi("\x1b[44mblue bg\x1b[0m");
      expect(spans).toEqual([
        { style: "background-color:#3465a4", content: "blue bg" },
      ]);
    });
  });

  // --- 256-color ---

  describe("256-color", () => {
    it("applies 256-color from basic palette (0-15)", () => {
      const spans = parseAnsi("\x1b[38;5;1mcolor1\x1b[0m");
      expect(spans.length).toBe(1);
      expect(spans[0]!.content).toBe("color1");
      expect(spans[0]!.style).toContain("color:");
      // color256(1) = ANSI_16[1] = #cc0000
      expect(spans[0]!.style).toBe("color:#cc0000");
    });

    it("applies 256-color from color cube (16-231)", () => {
      const spans = parseAnsi("\x1b[38;5;196mred256\x1b[0m");
      expect(spans.length).toBe(1);
      expect(spans[0]!.content).toBe("red256");
      expect(spans[0]!.style).toContain("color:#");
    });

    it("applies 256-color grayscale (232-255)", () => {
      const spans = parseAnsi("\x1b[38;5;248mgray\x1b[0m");
      expect(spans.length).toBe(1);
      expect(spans[0]!.content).toBe("gray");
      // Grayscale 248: 8 + (248-232)*10 = 168 => rgb(168,168,168)
      expect(spans[0]!.style).toBe("color:rgb(168,168,168)");
    });

    it("applies 256-color background", () => {
      const spans = parseAnsi("\x1b[48;5;196mred bg256\x1b[0m");
      expect(spans.length).toBe(1);
      expect(spans[0]!.style).toContain("background-color:");
    });
  });

  // --- RGB color ---

  describe("RGB color", () => {
    it("applies RGB foreground (38;2;r;g;b)", () => {
      const spans = parseAnsi("\x1b[38;2;255;128;0morange\x1b[0m");
      expect(spans).toEqual([
        { style: "color:rgb(255,128,0)", content: "orange" },
      ]);
    });

    it("applies RGB background (48;2;r;g;b)", () => {
      const spans = parseAnsi("\x1b[48;2;0;100;200mblue bg\x1b[0m");
      expect(spans).toEqual([
        { style: "background-color:rgb(0,100,200)", content: "blue bg" },
      ]);
    });
  });

  // --- Bold / Italic / Underline ---

  describe("text decorations", () => {
    it("applies bold (code 1)", () => {
      const spans = parseAnsi("\x1b[1mbold\x1b[0m");
      expect(spans).toEqual([
        { style: "font-weight:bold", content: "bold" },
      ]);
    });

    it("applies italic (code 3)", () => {
      const spans = parseAnsi("\x1b[3mitalic\x1b[0m");
      expect(spans).toEqual([
        { style: "font-style:italic", content: "italic" },
      ]);
    });

    it("applies underline (code 4)", () => {
      const spans = parseAnsi("\x1b[4munderlined\x1b[0m");
      expect(spans).toEqual([
        { style: "text-decoration:underline", content: "underlined" },
      ]);
    });

    it("applies bold + italic + underline combined", () => {
      const spans = parseAnsi("\x1b[1;3;4mall three\x1b[0m");
      expect(spans.length).toBe(1);
      expect(spans[0]!.style).toContain("font-weight:bold");
      expect(spans[0]!.style).toContain("font-style:italic");
      expect(spans[0]!.style).toContain("text-decoration:underline");
    });
  });

  // --- Reset codes ---

  describe("reset codes", () => {
    it("resets all formatting with \\x1b[0m", () => {
      const spans = parseAnsi("\x1b[31mred\x1b[0mnormal");
      expect(spans.length).toBe(2);
      expect(spans[0]).toEqual({ style: "color:#cc0000", content: "red" });
      expect(spans[1]).toEqual({ style: "", content: "normal" });
    });

    it("resets foreground with code 39", () => {
      const spans = parseAnsi("\x1b[31mred\x1b[39mplain");
      expect(spans.length).toBe(2);
      expect(spans[0]!.style).toBe("color:#cc0000");
      expect(spans[1]!.style).toBe("");
      expect(spans[1]!.content).toBe("plain");
    });

    it("resets bold with code 22", () => {
      const spans = parseAnsi("\x1b[1mbold\x1b[22mnormal");
      expect(spans.length).toBe(2);
      expect(spans[0]!.style).toBe("font-weight:bold");
      expect(spans[1]!.style).toBe("");
    });

    it("resets italic with code 23", () => {
      const spans = parseAnsi("\x1b[3mitalic\x1b[23mnormal");
      expect(spans.length).toBe(2);
      expect(spans[0]!.style).toBe("font-style:italic");
      expect(spans[1]!.style).toBe("");
    });

    it("resets underline with code 24", () => {
      const spans = parseAnsi("\x1b[4munder\x1b[24mnormal");
      expect(spans.length).toBe(2);
      expect(spans[0]!.style).toBe("text-decoration:underline");
      expect(spans[1]!.style).toBe("");
    });

    it("resets background with code 49", () => {
      const spans = parseAnsi("\x1b[41mred bg\x1b[49mplain");
      expect(spans.length).toBe(2);
      expect(spans[0]!.style).toBe("background-color:#cc0000");
      expect(spans[1]!.style).toBe("");
    });
  });

  // --- Nested / sequential formatting ---

  describe("sequential formatting", () => {
    it("handles multiple colored segments", () => {
      const spans = parseAnsi("\x1b[31mred\x1b[0m \x1b[32mgreen\x1b[0m \x1b[34mblue\x1b[0m");
      expect(spans.length).toBe(5);
      expect(spans[0]).toEqual({ style: "color:#cc0000", content: "red" });
      expect(spans[1]).toEqual({ style: "", content: " " });
      expect(spans[2]).toEqual({ style: "color:#4e9a06", content: "green" });
      expect(spans[3]).toEqual({ style: "", content: " " });
      expect(spans[4]).toEqual({ style: "color:#3465a4", content: "blue" });
    });

    it("handles bold then color change", () => {
      const spans = parseAnsi("\x1b[1m\x1b[31mbold red\x1b[0m");
      expect(spans.length).toBe(1);
      expect(spans[0]!.style).toContain("font-weight:bold");
      expect(spans[0]!.style).toContain("color:");
    });

    it("handles color then bold addition", () => {
      const spans = parseAnsi("\x1b[31mred\x1b[1mred bold\x1b[0m");
      expect(spans.length).toBe(2);
      // First: just red (no bold)
      expect(spans[0]!.style).toBe("color:#cc0000");
      expect(spans[0]!.content).toBe("red");
      // Second: red + bold (bold activates, so bright variant used)
      expect(spans[1]!.style).toContain("font-weight:bold");
      expect(spans[1]!.style).toContain("color:");
      expect(spans[1]!.content).toBe("red bold");
    });

    it("handles dim (code 2) removing bold", () => {
      const spans = parseAnsi("\x1b[1mbold\x1b[2mdim\x1b[0m");
      expect(spans.length).toBe(2);
      expect(spans[0]!.style).toBe("font-weight:bold");
      // After dim, bold is false, no font-weight in style
      expect(spans[1]!.style).toBe("");
    });
  });

  // --- Bright colors (90-97) ---

  describe("bright colors", () => {
    it("applies bright red (91)", () => {
      const spans = parseAnsi("\x1b[91mbright red\x1b[0m");
      expect(spans.length).toBe(1);
      // ANSI_16_BRIGHT[1] = #ef2929
      expect(spans[0]!.style).toBe("color:#ef2929");
    });

    it("applies bright green (92)", () => {
      const spans = parseAnsi("\x1b[92mbright green\x1b[0m");
      expect(spans[0]!.style).toBe("color:#8ae234");
    });
  });

  // --- Bold mode affects color selection ---

  describe("bold mode color selection", () => {
    it("uses bright color variant when bold is active for basic 30-37", () => {
      const spans = parseAnsi("\x1b[1;31mbold red\x1b[0m");
      expect(spans.length).toBe(1);
      // Bold + red (31): ANSI_16_BRIGHT[1] = #ef2929
      expect(spans[0]!.style).toContain("color:#ef2929");
    });

    it("uses normal color when bold is not active", () => {
      const spans = parseAnsi("\x1b[31mnormal red\x1b[0m");
      expect(spans.length).toBe(1);
      // Normal red (31): ANSI_16[1] = #cc0000
      expect(spans[0]!.style).toBe("color:#cc0000");
    });
  });

  // --- color256 helper ---

  describe("color256", () => {
    it("returns hex for basic palette (0-15)", () => {
      expect(color256(0)).toBe("#000000");
      expect(color256(1)).toBe("#cc0000");
      expect(color256(15)).toBe("#eeeeec");
    });

    it("returns hex for color cube (16-231)", () => {
      const result = color256(16);
      expect(result).toMatch(/^#[0-9a-f]{6}$/);
    });

    it("returns rgb for grayscale (232-255)", () => {
      expect(color256(232)).toBe("rgb(8,8,8)");
      expect(color256(255)).toBe("rgb(238,238,238)");
    });

    it("returns fallback for out-of-range", () => {
      // Should not crash
      const result = color256(-1);
      expect(typeof result).toBe("string");
    });
  });
});
