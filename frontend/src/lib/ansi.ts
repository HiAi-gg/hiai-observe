/**
 * ANSI escape code parser for terminal color/style rendering.
 * Extracted from AnsiText.svelte for testability.
 */

export interface AnsiSpan {
  style: string;
  content: string;
}

// Standard 16-color palette (0-15)
export const ANSI_16: Record<number, string> = {
  0: "#000000", 1: "#cc0000", 2: "#4e9a06", 3: "#c4a000",
  4: "#3465a4", 5: "#75507b", 6: "#06989a", 7: "#d3d7cf",
  8: "#555753", 9: "#ef2929", 10: "#8ae234", 11: "#fce94f",
  12: "#729fcf", 13: "#ad7fa8", 14: "#34e2e2", 15: "#eeeeec",
};

// Bright variants for bold mode
export const ANSI_16_BRIGHT: Record<number, string> = {
  0: "#555753", 1: "#ef2929", 2: "#8ae234", 3: "#fce94f",
  4: "#729fcf", 5: "#ad7fa8", 6: "#34e2e2", 7: "#eeeeec",
  8: "#888a85", 9: "#ff6b6b", 10: "#a8ff60", 11: "#ffff80",
  12: "#9dc6ff", 13: "#d4a0d4", 14: "#80fffe", 15: "#ffffff",
};

export function color256(n: number): string {
  if (n < 16) return ANSI_16[n] ?? "#ffffff";
  if (n < 232) {
    // 6x6x6 color cube: indices 16-231
    const idx = n - 16;
    const r = Math.floor(idx / 36);
    const g = Math.floor((idx % 36) / 6);
    const b = idx % 6;
    const toHex = (c: number) => (c === 0 ? 0 : 55 + c * 40).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  // Grayscale: indices 232-255
  const gray = 8 + (n - 232) * 10;
  return `rgb(${gray},${gray},${gray})`;
}

export function parseAnsi(rawText: string): AnsiSpan[] {
  const spans: AnsiSpan[] = [];
  // Match ESC[ ... m sequences (SGR)
  const regex = /\x1b\[([0-9;]*)m/g;
  let currentStyle = "";
  let lastIndex = 0;
  let bold = false;
  let italic = false;
  let underline = false;
  let fg: string | null = null;
  let bg: string | null = null;

  function buildStyle(): string {
    const parts: string[] = [];
    if (bold) parts.push("font-weight:bold");
    if (italic) parts.push("font-style:italic");
    if (underline) parts.push("text-decoration:underline");
    if (fg) parts.push(`color:${fg}`);
    if (bg) parts.push(`background-color:${bg}`);
    return parts.join(";");
  }

  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawText)) !== null) {
    // Push text before this escape sequence
    if (match.index > lastIndex) {
      const content = rawText.slice(lastIndex, match.index);
      if (content) spans.push({ style: currentStyle, content });
    }

    // Parse SGR parameters
    const params = match[1] ? match[1].split(";").map(Number) : [0];
    let i = 0;
    while (i < params.length) {
      const code = params[i]!;
      if (code === 0) {
        // Reset all
        bold = false; italic = false; underline = false; fg = null; bg = null;
      } else if (code === 1) {
        bold = true;
      } else if (code === 2) {
        // Dim (treat as normal weight)
        bold = false;
      } else if (code === 3) {
        italic = true;
      } else if (code === 4) {
        underline = true;
      } else if (code === 22) {
        bold = false;
      } else if (code === 23) {
        italic = false;
      } else if (code === 24) {
        underline = false;
      } else if (code >= 30 && code <= 37) {
        const idx = code - 30;
        fg = bold ? (ANSI_16_BRIGHT[idx] ?? ANSI_16[idx] ?? "#ffffff") : (ANSI_16[idx] ?? "#ffffff");
      } else if (code === 38) {
        // Extended foreground
        if (params[i + 1] === 5 && params[i + 2] !== undefined) {
          fg = color256(params[i + 2]!);
          i += 2;
        } else if (params[i + 1] === 2 && params[i + 4] !== undefined) {
          fg = `rgb(${params[i + 2]},${params[i + 3]},${params[i + 4]})`;
          i += 4;
        }
      } else if (code === 39) {
        fg = null;
      } else if (code >= 40 && code <= 47) {
        const idx = code - 40;
        bg = ANSI_16[idx] ?? "#000000";
      } else if (code === 48) {
        // Extended background
        if (params[i + 1] === 5 && params[i + 2] !== undefined) {
          bg = color256(params[i + 2]!);
          i += 2;
        } else if (params[i + 1] === 2 && params[i + 4] !== undefined) {
          bg = `rgb(${params[i + 2]},${params[i + 3]},${params[i + 4]})`;
          i += 4;
        }
      } else if (code === 49) {
        bg = null;
      } else if (code >= 90 && code <= 97) {
        const idx = code - 90;
        fg = ANSI_16_BRIGHT[idx] ?? ANSI_16[idx] ?? "#ffffff";
      }
      i++;
    }

    currentStyle = buildStyle();
    lastIndex = match.index + match[0].length;
  }

  // Push remaining text
  if (lastIndex < rawText.length) {
    const content = rawText.slice(lastIndex);
    if (content) spans.push({ style: currentStyle, content });
  }

  // If no ANSI codes found at all, return raw text
  if (spans.length === 0 && rawText) {
    spans.push({ style: "", content: rawText });
  }

  return spans;
}
