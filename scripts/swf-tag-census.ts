// Counts, for each SWF tag code, how many READABLE files in a corpus carry it — once per file, not once
// per occurrence. This is the instrument behind the frequency figures in `agents/packages/swf/tag-coverage.md`
// and `fixture-evidence.md`.
//
// WHY THIS IS COMMITTED WHEN THE CORPUS IT MEASURES NEVER IS. The licence rule forbids vendoring a corpus;
// it says nothing about the tool that measures one, and the two are not the same thing. **Where a corpus
// cannot be committed, the instrument is the only reproducible half** — so discarding it as a throwaway
// probe discards all of the reproducibility there was. Every stamped corpus figure in this cell claims a
// route back to a current value, and a route is only a route if someone can walk it.
//
// NOTHING OF ANYONE ELSE'S IS HERE: no fixture bytes, no filenames, no table derived from licensed
// material, no terms. The corpus directory is a runtime argument, so this file is inert without one.
//
// Usage: `npm run capabilities:tag-census -- <corpus-directory>`
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { inflateDeflate, registerDeflateDecompressor } from '@flighthq/compression/contract';
import { createScene2DFromSwf } from '@flighthq/swf/contract';
import { CompressionFraming } from '@flighthq/types/contract';

const DEFINE_SPRITE = 39;
const END = 0;
const FWS = 0x46;
const CWS = 0x43;
const LONG_LENGTH = 0x3f;

// A `CWS` container is zlib-compressed after its 8-byte header; an `FWS` one is already the bytes to read.
// The header is rewritten to `FWS` so the walk below has one shape to handle rather than two.
function uncompressContainer(source: Uint8Array): Uint8Array | null {
  if (source[0] === FWS) return source;
  if (source[0] !== CWS) return null;
  const length = source[4] | (source[5] << 8) | (source[6] << 16) | (source[7] << 24);
  const body = inflateDeflate(source.subarray(8), length - 8, CompressionFraming.Rfc1950);
  if (body === null) return null;
  const out = new Uint8Array(length);
  out.set(source.subarray(0, 8));
  out[0] = FWS;
  out.set(body.subarray(0, length - 8), 8);
  return out;
}

// Each record is a uint16 whose top 10 bits are the code and low 6 the length, with 0x3f meaning a uint32
// length follows. Sprite bodies are walked too, because a definition may sit inside one and a census that
// skipped them would undercount exactly the tags most likely to be nested.
function collectTagCodes(bytes: Uint8Array, start: number, end: number, out: Set<number>): void {
  let pos = start;
  while (pos + 2 <= end) {
    const header = bytes[pos] | (bytes[pos + 1] << 8);
    pos += 2;
    const code = header >> 6;
    let length = header & LONG_LENGTH;
    if (length === LONG_LENGTH) {
      length = bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24);
      pos += 4;
    }
    if (code === END) break;
    out.add(code);
    // A sprite header is two uint16s (character id, frame count) before its own tag stream.
    if (code === DEFINE_SPRITE) collectTagCodes(bytes, pos + 4, Math.min(pos + length, end), out);
    pos += length;
  }
}

const directory = process.argv[2];
if (directory === undefined) {
  process.stderr.write('usage: npm run capabilities:tag-census -- <corpus-directory>\n');
  process.exitCode = 1;
} else {
  registerDeflateDecompressor();
  const counts = new Map<number, number>();
  let readable = 0;
  let total = 0;

  for (const name of readdirSync(directory)
    .filter((entry) => entry.endsWith('.swf'))
    .sort()) {
    total++;
    const raw = new Uint8Array(readFileSync(join(directory, name)));
    // "Readable" means the importer produced a document. An unreadable file contributes to no tag count,
    // which is why the readable total is printed beside the rows rather than left implicit.
    if (createScene2DFromSwf(raw) === null) continue;
    readable++;
    const bytes = uncompressContainer(raw);
    if (bytes === null) continue;
    const seen = new Set<number>();
    // The stage RECT is bit-packed, so its byte length depends on its own first five bits.
    collectTagCodes(bytes, 8 + Math.ceil((5 + (bytes[8] >> 3) * 4) / 8) + 4, bytes.length, seen);
    for (const code of seen) counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  // EVERY code seen, not a curated selection: choosing which tags to report would put a semantic decision
  // inside a measurement, and the reader can group afterwards.
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  process.stdout.write(`${JSON.stringify({ files: total, readable, tagCodes: Object.fromEntries(rows) }, null, 2)}\n`);
}
