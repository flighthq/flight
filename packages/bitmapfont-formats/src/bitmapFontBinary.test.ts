import type { BitmapFontCharRecord, BitmapFontKerningRecord, BitmapFontPageRecord } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { parseBitmapFontBinary } from './bitmapFontBinary';

function buildBinaryFont(options: {
  chars?: BitmapFontCharRecord[];
  common?: { base: number; lineHeight: number };
  kernings?: BitmapFontKerningRecord[];
  pages?: BitmapFontPageRecord[];
}): Uint8Array {
  const blocks: Uint8Array[] = [];

  if (options.common !== undefined) {
    const common = new Uint8Array(15);
    const view = new DataView(common.buffer);
    view.setUint16(0, options.common.lineHeight, true);
    view.setUint16(2, options.common.base, true);
    blocks.push(makeBlock(2, common));
  }

  if (options.pages !== undefined && options.pages.length > 0) {
    const parts: number[] = [];
    for (const page of options.pages) {
      for (let i = 0; i < page.file.length; i++) parts.push(page.file.charCodeAt(i));
      parts.push(0);
    }
    blocks.push(makeBlock(3, new Uint8Array(parts)));
  }

  if (options.chars !== undefined) {
    const data = new Uint8Array(options.chars.length * 20);
    const view = new DataView(data.buffer);
    for (let i = 0; i < options.chars.length; i++) {
      const c = options.chars[i];
      const off = i * 20;
      view.setUint32(off, c.id, true);
      view.setUint16(off + 4, c.x, true);
      view.setUint16(off + 6, c.y, true);
      view.setUint16(off + 8, c.width, true);
      view.setUint16(off + 10, c.height, true);
      view.setInt16(off + 12, c.xoffset, true);
      view.setInt16(off + 14, c.yoffset, true);
      view.setInt16(off + 16, c.xadvance, true);
      view.setUint8(off + 18, c.page);
    }
    blocks.push(makeBlock(4, data));
  }

  if (options.kernings !== undefined && options.kernings.length > 0) {
    const data = new Uint8Array(options.kernings.length * 10);
    const view = new DataView(data.buffer);
    for (let i = 0; i < options.kernings.length; i++) {
      const k = options.kernings[i];
      const off = i * 10;
      view.setUint32(off, k.first, true);
      view.setUint32(off + 4, k.second, true);
      view.setInt16(off + 8, k.amount, true);
    }
    blocks.push(makeBlock(5, data));
  }

  let total = 4;
  for (const block of blocks) total += block.length;
  const result = new Uint8Array(total);
  result[0] = 66;
  result[1] = 77;
  result[2] = 70;
  result[3] = 3;
  let offset = 4;
  for (const block of blocks) {
    result.set(block, offset);
    offset += block.length;
  }
  return result;
}

function makeBlock(type: number, data: Uint8Array): Uint8Array {
  const block = new Uint8Array(5 + data.length);
  block[0] = type;
  const view = new DataView(block.buffer);
  view.setUint32(1, data.length, true);
  block.set(data, 5);
  return block;
}

describe('parseBitmapFontBinary', () => {
  it('returns null for empty input', () => {
    expect(parseBitmapFontBinary(new Uint8Array(0))).toBe(null);
  });

  it('returns null for wrong magic bytes', () => {
    expect(parseBitmapFontBinary(new Uint8Array([0, 0, 0, 3]))).toBe(null);
  });

  it('returns null for wrong version', () => {
    expect(parseBitmapFontBinary(new Uint8Array([66, 77, 70, 2]))).toBe(null);
  });

  it('returns null when common block is missing', () => {
    const bytes = buildBinaryFont({
      chars: [{ height: 10, id: 65, page: 0, width: 10, x: 0, xadvance: 10, xoffset: 0, y: 0, yoffset: 0 }],
    });
    expect(parseBitmapFontBinary(bytes)).toBe(null);
  });

  it('returns null when chars block is missing', () => {
    const bytes = buildBinaryFont({ common: { base: 24, lineHeight: 32 } });
    expect(parseBitmapFontBinary(bytes)).toBe(null);
  });

  it('parses a minimal binary font', () => {
    const bytes = buildBinaryFont({
      chars: [{ height: 10, id: 65, page: 0, width: 8, x: 0, xadvance: 10, xoffset: 1, y: 0, yoffset: 2 }],
      common: { base: 24, lineHeight: 32 },
      pages: [{ file: 'font.png', id: 0 }],
    });
    const font = parseBitmapFontBinary(bytes, {
      resolvePage: () => ({ texture: null as never }),
    });
    expect(font).not.toBe(null);
    expect(font!.glyphs.has(65)).toBe(true);
    const glyph = font!.glyphs.get(65)!;
    expect(glyph.width).toBe(8);
    expect(glyph.advance).toBe(10);
    expect(glyph.bearingX).toBe(1);
    expect(glyph.bearingY).toBe(24 - 2);
  });

  it('parses kerning pairs', () => {
    const bytes = buildBinaryFont({
      chars: [{ height: 10, id: 65, page: 0, width: 8, x: 0, xadvance: 10, xoffset: 0, y: 0, yoffset: 0 }],
      common: { base: 24, lineHeight: 32 },
      kernings: [{ amount: -2, first: 65, second: 86 }],
      pages: [{ file: 'font.png', id: 0 }],
    });
    const font = parseBitmapFontBinary(bytes, {
      resolvePage: () => ({ texture: null as never }),
    });
    expect(font).not.toBe(null);
    expect(font!.kerning.size).toBe(1);
  });

  it('parses multiple pages', () => {
    const bytes = buildBinaryFont({
      chars: [
        { height: 10, id: 65, page: 0, width: 8, x: 0, xadvance: 10, xoffset: 0, y: 0, yoffset: 0 },
        { height: 10, id: 66, page: 1, width: 8, x: 0, xadvance: 10, xoffset: 0, y: 0, yoffset: 0 },
      ],
      common: { base: 24, lineHeight: 32 },
      pages: [
        { file: 'font0.png', id: 0 },
        { file: 'font1.png', id: 1 },
      ],
    });
    const font = parseBitmapFontBinary(bytes, {
      resolvePage: () => ({ texture: null as never }),
    });
    expect(font).not.toBe(null);
    expect(font!.pages).toHaveLength(2);
  });

  it('returns null when a referenced page cannot be resolved', () => {
    const bytes = buildBinaryFont({
      chars: [{ height: 10, id: 65, page: 0, width: 8, x: 0, xadvance: 10, xoffset: 0, y: 0, yoffset: 0 }],
      common: { base: 24, lineHeight: 32 },
      pages: [{ file: 'font.png', id: 0 }],
    });
    expect(parseBitmapFontBinary(bytes)).toBe(null);
  });

  it('handles negative xoffset and yoffset', () => {
    const bytes = buildBinaryFont({
      chars: [{ height: 10, id: 65, page: 0, width: 8, x: 0, xadvance: 10, xoffset: -3, y: 0, yoffset: -1 }],
      common: { base: 24, lineHeight: 32 },
      pages: [{ file: 'font.png', id: 0 }],
    });
    const font = parseBitmapFontBinary(bytes, {
      resolvePage: () => ({ texture: null as never }),
    });
    expect(font).not.toBe(null);
    const glyph = font!.glyphs.get(65)!;
    expect(glyph.bearingX).toBe(-3);
    expect(glyph.bearingY).toBe(24 - -1);
  });

  it('tolerates truncated block gracefully', () => {
    const bytes = buildBinaryFont({
      chars: [{ height: 10, id: 65, page: 0, width: 8, x: 0, xadvance: 10, xoffset: 0, y: 0, yoffset: 0 }],
      common: { base: 24, lineHeight: 32 },
    });
    const truncated = bytes.slice(0, bytes.length - 5);
    expect(parseBitmapFontBinary(truncated)).toBe(null);
  });
});
