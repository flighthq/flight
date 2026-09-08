import type {
  BitmapFont,
  ImportDiagnostic,
  BitmapFontCharRecord,
  BitmapFontEncoding,
  BitmapFontKerningRecord,
  BitmapFontPageRecord,
  BitmapFontParseOptions,
  BitmapFontRecord,
} from '@flighthq/types/contract';

import { buildBitmapFontFromRecord, reportDroppedBitmapFontRecords } from './bitmapFontRecord';

// Parses the BMFont binary `.fnt` format (version 3) into a `BitmapFont`. The binary layout is a
// 4-byte header (`BMF` + version byte 3) followed by typed blocks: block 1 = info, block 2 =
// common, block 3 = pages (null-terminated filename strings), block 4 = chars (20 bytes each),
// block 5 = kerning pairs (10 bytes each). Each block is prefixed with a 1-byte type and a 4-byte
// LE size. Returns the `null` sentinel — never throwing — for truncated data, an unrecognized
// header, a missing `common`/`chars` block, or an atlas page that cannot be resolved.
export function parseBitmapFontBinary(
  bytes: Readonly<Uint8Array>,
  options?: Readonly<BitmapFontParseOptions>,
  diagnostics?: ImportDiagnostic[],
): BitmapFont | null {
  const record = parseBitmapFontBinaryRecord(bytes, diagnostics);
  if (record === null) return null;
  return buildBitmapFontFromRecord(record, options);
}

function parseBitmapFontBinaryRecord(
  bytes: Readonly<Uint8Array>,
  diagnostics: ImportDiagnostic[] | undefined,
): BitmapFontRecord | null {
  if (bytes.length < 4) return null;
  if (bytes[0] !== 66 || bytes[1] !== 77 || bytes[2] !== 70 || bytes[3] !== 3) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 4;

  let lineHeight: number | null = null;
  let base: number | null = null;
  let encoding: BitmapFontEncoding = 'raster';
  const pages: BitmapFontPageRecord[] = [];
  const chars: BitmapFontCharRecord[] = [];
  const kernings: BitmapFontKerningRecord[] = [];
  let droppedChars = 0;
  let droppedKernings = 0;

  while (offset + 5 <= bytes.length) {
    const blockType = view.getUint8(offset);
    const blockSize = view.getUint32(offset + 1, true);
    offset += 5;
    if (offset + blockSize > bytes.length) break;
    const blockEnd = offset + blockSize;

    if (blockType === BLOCK_INFO) {
      readInfoBlock(view, offset, blockSize);
    } else if (blockType === BLOCK_COMMON) {
      if (blockSize >= 4) {
        lineHeight = view.getUint16(offset, true);
        base = view.getUint16(offset + 2, true);
      }
    } else if (blockType === BLOCK_PAGES) {
      readPageBlock(bytes, offset, blockSize, pages);
    } else if (blockType === BLOCK_CHARS) {
      const count = (blockSize / CHAR_STRIDE) | 0;
      for (let i = 0; i < count; i++) {
        const charOffset = offset + i * CHAR_STRIDE;
        const char = readBinaryChar(view, charOffset);
        if (char === null) droppedChars++;
        else chars.push(char);
      }
    } else if (blockType === BLOCK_KERNING) {
      const count = (blockSize / KERNING_STRIDE) | 0;
      for (let i = 0; i < count; i++) {
        const kerningOffset = offset + i * KERNING_STRIDE;
        const kerning = readBinaryKerning(view, kerningOffset);
        if (kerning === null) droppedKernings++;
        else kernings.push(kerning);
      }
    }

    offset = blockEnd;
  }

  reportDroppedBitmapFontRecords(diagnostics, 'parseBitmapFontBinaryRecord', 0, droppedChars, droppedKernings);
  if (lineHeight === null || base === null || chars.length === 0) return null;
  return { base, chars, encoding, kernings, lineHeight, pages };
}

function readBinaryChar(view: DataView, offset: number): BitmapFontCharRecord | null {
  const id = view.getUint32(offset, true);
  const x = view.getUint16(offset + 4, true);
  const y = view.getUint16(offset + 6, true);
  const width = view.getUint16(offset + 8, true);
  const height = view.getUint16(offset + 10, true);
  const xoffset = view.getInt16(offset + 12, true);
  const yoffset = view.getInt16(offset + 14, true);
  const xadvance = view.getInt16(offset + 16, true);
  const page = view.getUint8(offset + 18);
  if (!Number.isFinite(id)) return null;
  return { height, id, page, width, x, xadvance, xoffset, y, yoffset };
}

function readBinaryKerning(view: DataView, offset: number): BitmapFontKerningRecord | null {
  const first = view.getUint32(offset, true);
  const second = view.getUint32(offset + 4, true);
  const amount = view.getInt16(offset + 8, true);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  return { amount, first, second };
}

function readInfoBlock(_view: DataView, _offset: number, _size: number): void {
  // The info block carries face name, style flags, and charset — metadata the BitmapFont model does
  // not preserve. Skipped intentionally; the block is consumed only to advance past it.
}

function readPageBlock(bytes: Readonly<Uint8Array>, offset: number, size: number, pages: BitmapFontPageRecord[]): void {
  let id = 0;
  let start = offset;
  const end = offset + size;
  for (let i = offset; i < end; i++) {
    if (bytes[i] === 0) {
      const file = decodePageName(bytes, start, i);
      pages.push({ file, id });
      id++;
      start = i + 1;
    }
  }
}

function decodePageName(bytes: Readonly<Uint8Array>, start: number, end: number): string {
  let result = '';
  for (let i = start; i < end; i++) result += String.fromCharCode(bytes[i]);
  return result;
}

const BLOCK_INFO = 1;
const BLOCK_COMMON = 2;
const BLOCK_PAGES = 3;
const BLOCK_CHARS = 4;
const BLOCK_KERNING = 5;
const CHAR_STRIDE = 20;
const KERNING_STRIDE = 10;
