import { decodeUTF8 } from '@flighthq/encoding/contract';
import { getKindMapKeys, withKindMapEntry, withoutKindMapEntry } from '@flighthq/registry/contract';
import type {
  BitmapFont,
  BitmapFontFormatDescriptor,
  BitmapFontFormatEntry,
  BitmapFontFormatKind,
  BitmapFontImportOptions,
  BitmapFontParseOptions,
  ImportDiagnostic,
  Kind,
} from '@flighthq/types/contract';
import {
  BitmapFontFormatKindBmFontBinary,
  BitmapFontFormatKindBmFontJson,
  BitmapFontFormatKindBmFontText,
  BitmapFontFormatKindBmFontXml,
} from '@flighthq/types/contract';

import { parseBitmapFontBinary } from './bitmapFontBinary.ts';
import { parseBitmapFontFnt } from './bitmapFontFnt.ts';
import { readBitmapFontFormatKind } from './bitmapFontFormatKind.ts';
import { parseBitmapFontJson } from './bitmapFontJson.ts';
import { parseBitmapFontXml } from './bitmapFontXml.ts';

/**
 * Installs the formats named in `options` into the registry.
 *
 * ★ THE SEAM IS EXPLICIT AND NOTHING REGISTERS ON IMPORT. This package declares `"sideEffects": false`, so the
 * built-ins are seeded by the registry's own initializer rather than by front-end modules registering
 * themselves — and options stay inert data a caller applies when they choose.
 *
 * Re-registering a kind is last-write-wins. Detection does not depend on registration order: every built-in
 * detector asks one shared discrimination and answers only for its own kind.
 */
export function applyBitmapFontImportOptions(options: Readonly<BitmapFontImportOptions>): void {
  for (const format of options.formats ?? []) bindBitmapFontFormat(format.kind, format.entry);
}

/** Sniff the bytes of a bitmap font descriptor and return its format kind, or `null` when no registered format
 *  recognises it.
 *
 *  Detection is structural, not extension-based, which matters more here than for most families: BMFont writes
 *  its binary, text and XML forms all under `.fnt`, so the extension cannot name the format.
 *
 *  Returns `null` for unknown or corrupt input — never throws. */
export function detectBitmapFontFormat(bytes: Readonly<Uint8Array>): BitmapFontFormatKind | null {
  for (const [kind, entry] of getRegistry()) {
    if (entry.detect(bytes)) return kind;
  }
  return null;
}

/** Retrieve the registered entry for a `BitmapFontFormatKind`, or `null` when none is registered.
 *
 *  Useful for introspecting which formats are available, or for calling one format's detector or parser
 *  directly without going through detection. */
export function getBitmapFontFormat(kind: BitmapFontFormatKind): Readonly<BitmapFontFormatEntry> | null {
  return getRegistry().get(kind) ?? null;
}

/** Return a sorted snapshot of every bound bitmap font format kind. */
export function getBitmapFontFormatKinds(): readonly BitmapFontFormatKind[] {
  const kinds: BitmapFontFormatKind[] = [];
  getKindMapKeys(kinds, getRegistry());
  return kinds;
}

/** Parse a bitmap font descriptor into a `BitmapFont`, auto-detecting the format.
 *
 *  Pass `formatKind` to skip detection when the format is already known. Returns `null` when the format is not
 *  recognised, or when the recognised front end rejects the document — an expected failure, not a throw. */
export function parseBitmapFont(
  bytes: Readonly<Uint8Array>,
  formatKind?: BitmapFontFormatKind,
  options?: Readonly<BitmapFontParseOptions>,
  diagnostics?: ImportDiagnostic[],
): BitmapFont | null {
  const kind = formatKind ?? detectBitmapFontFormat(bytes);
  if (kind === null || kind === undefined) return null;
  return getBitmapFontFormat(kind)?.parse(bytes, options, diagnostics) ?? null;
}

/** Register a custom bitmap font format for `detectBitmapFontFormat` and `parseBitmapFont`.
 *
 *  Last-write-wins: registering a built-in kind replaces it. Third-party formats should use a vendor-prefixed
 *  kind (e.g. `'acme.MyFont'`) so they cannot collide with a built-in.
 *
 *  A custom detector should be as narrow as the built-ins are — they are mutually exclusive, so detection does
 *  not depend on registration order today, and a broad custom detector is the one way to reintroduce that
 *  dependence. */
export function registerBitmapFontFormat(kind: BitmapFontFormatKind, entry: BitmapFontFormatEntry): void {
  bindBitmapFontFormat(kind, entry);
}

export const bmFontBinaryFormat: Readonly<BitmapFontFormatDescriptor> = {
  entry: {
    detect: (bytes) => readBitmapFontFormatKind(bytes) === BitmapFontFormatKindBmFontBinary,
    parse: (bytes, options, diagnostics) => parseBitmapFontBinary(bytes, options, diagnostics),
  },
  kind: BitmapFontFormatKindBmFontBinary,
};

export const bmFontJsonFormat: Readonly<BitmapFontFormatDescriptor> = {
  entry: {
    detect: (bytes) => readBitmapFontFormatKind(bytes) === BitmapFontFormatKindBmFontJson,
    parse: (bytes, options, diagnostics) => parseBitmapFontJson(decodeUTF8(bytes), options, diagnostics),
  },
  kind: BitmapFontFormatKindBmFontJson,
};

export const bmFontTextFormat: Readonly<BitmapFontFormatDescriptor> = {
  entry: {
    detect: (bytes) => readBitmapFontFormatKind(bytes) === BitmapFontFormatKindBmFontText,
    parse: (bytes, options, diagnostics) => parseBitmapFontFnt(decodeUTF8(bytes), options, diagnostics),
  },
  kind: BitmapFontFormatKindBmFontText,
};

export const bmFontXmlFormat: Readonly<BitmapFontFormatDescriptor> = {
  entry: {
    detect: (bytes) => readBitmapFontFormatKind(bytes) === BitmapFontFormatKindBmFontXml,
    parse: (bytes, options, diagnostics) => parseBitmapFontXml(decodeUTF8(bytes), options, diagnostics),
  },
  kind: BitmapFontFormatKindBmFontXml,
};

/**
 * Every built-in bitmap font format.
 *
 * Naming this is equivalent to what the registry seeds itself with, and it is what a caller passes when they want
 * every format. A caller wanting a subset names the descriptors they want, and the front ends they leave out —
 * with their XML or JSON readers — never link. The list is alphabetical by kind because nothing depends on its
 * order; `describe('bitmapFontAllFormats')` measures that.
 */
export const bitmapFontAllFormats: readonly Readonly<BitmapFontFormatDescriptor>[] = [
  bmFontBinaryFormat,
  bmFontJsonFormat,
  bmFontTextFormat,
  bmFontXmlFormat,
];

/** Remove a format binding, including a caller override of a built-in kind. */
export function unregisterBitmapFontFormat(kind: BitmapFontFormatKind): void {
  _registry = withoutKindMapEntry(getRegistry(), kind);
}

function bindBitmapFontFormat(kind: BitmapFontFormatKind, entry: BitmapFontFormatEntry): void {
  _registry = withKindMapEntry(getRegistry(), kind, entry);
}

// Seeded from the full preset, so the built-in set lives in exactly one place instead of being stated here and
// restated by anyone assembling the same set. Built-ins are seeded here rather than self-registering from their
// own modules on import: this package declares `"sideEffects": false`, so a top-level
// `registerBitmapFontFormat` call in each front end would be the import-time side effect the SDK bans, and it
// would drag every front end into any consumer that imported one.
function getRegistry(): ReadonlyMap<Kind, BitmapFontFormatEntry> {
  if (_registry !== null) return _registry;
  _registry = new Map();
  applyBitmapFontImportOptions({ formats: bitmapFontAllFormats });
  return _registry;
}

let _registry: ReadonlyMap<Kind, BitmapFontFormatEntry> | null = null;
