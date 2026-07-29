import type { ImportDiagnostic, Skeleton2DImport } from '@flighthq/types/contract';

import { parseSpineSkeleton } from './spineParse';

// The open skeleton-format registry: `kind → { detect, parse }`, last-write-wins, so a caller can register
// a custom (vendor-prefixed) format and importing one parser excludes the rest. Built lazily on first use
// — never at module top level — so the package stays import-side-effect-free.
interface SkeletonFormatEntry {
  detect: (text: string) => boolean;
  parse: (text: string, diagnostics?: ImportDiagnostic[]) => Skeleton2DImport | null;
}

let _registry: Map<string, SkeletonFormatEntry> | null = null;

function getRegistry(): Map<string, SkeletonFormatEntry> {
  if (_registry !== null) return _registry;
  _registry = new Map();
  _registry.set('Spine', { detect: detectSpine, parse: (text, diagnostics) => parseSpineSkeleton(text, diagnostics) });
  return _registry;
}

// A Spine skeleton JSON is an object carrying a `bones`, `skeleton`, or `slots` key. (The `.skel` binary
// and DragonBones are later formats behind this same seam.)
function detectSpine(text: string): boolean {
  if (text.trimStart()[0] !== '{') return false;
  return /"bones"\s*:/.test(text) || /"skeleton"\s*:/.test(text) || /"slots"\s*:/.test(text);
}

// Auto-detects the skeleton format of `text` and parses it, threading the optional diagnostics sink.
// Returns the sentinel `null` when no registered format recognizes the input (the expected
// "unrecognized format" failure) or the recognized parser itself rejects it.
export function parseSkeleton2D(text: string, diagnostics?: ImportDiagnostic[]): Skeleton2DImport | null {
  for (const entry of getRegistry().values()) {
    if (entry.detect(text)) return entry.parse(text, diagnostics);
  }
  return null;
}

// Registers (or, last-write-wins, overrides) a skeleton format under `kind` (vendor-prefix a custom one,
// e.g. `'acme.Rig'`; bare names are reserved for built-ins). `detect` decides whether a text is this
// format; `parse` maps it to a Skeleton2DImport (or `null` on rejection).
export function registerSkeleton2DFormat(
  kind: string,
  detect: (text: string) => boolean,
  parse: (text: string, diagnostics?: ImportDiagnostic[]) => Skeleton2DImport | null,
): void {
  getRegistry().set(kind, { detect, parse });
}
