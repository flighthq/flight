import {
  createKeyedTable,
  getRegistryTableEntry,
  getRegistryTableKeys,
  withRegistryTableEntry,
  withoutRegistryTableEntry,
} from '@flighthq/registry/contract';
import type { ImportDiagnostic, KeyedTable, Skeleton2DImport } from '@flighthq/types/contract';

import { parseDragonBonesSkeleton } from './dragonBonesParse';
import { parseSpineSkeleton } from './spineParse';

// The open skeleton-format registry: `kind → { detect, parse }`, last-write-wins, so a caller can register
// a custom (vendor-prefixed) format and importing one parser excludes the rest. Built lazily on first use
// — never at module top level — so the package stays import-side-effect-free.
interface SkeletonFormatEntry {
  detect: (text: string) => boolean;
  parse: (text: string, diagnostics?: ImportDiagnostic[]) => Skeleton2DImport | null;
}

interface RegisteredSkeletonFormat {
  entry: SkeletonFormatEntry;
  order: number;
}

function getRegistry(): KeyedTable<RegisteredSkeletonFormat> {
  if (_registry !== null) return _registry;
  _registry = createKeyedTable('Skeleton2DFormat', 'Unclaimed');
  bindSkeleton2DFormat('Spine', detectSpine, (text, diagnostics) => parseSpineSkeleton(text, diagnostics));
  bindSkeleton2DFormat('DragonBones', detectDragonBones, (text, diagnostics) =>
    parseDragonBonesSkeleton(text, diagnostics),
  );
  return _registry;
}

// A DragonBones skeleton JSON is an object carrying an `armature` array (its skeleton container). Distinct
// from Spine, whose bone/slot arrays are top-level rather than nested under an armature.
function detectDragonBones(text: string): boolean {
  if (text.trimStart()[0] !== '{') return false;
  return /"armature"\s*:/.test(text);
}

// A Spine skeleton JSON is an object carrying a `bones`, `skeleton`, or `slots` key. The `.skel` BINARY is
// deliberately not behind this seam: this registry dispatches on decoded text, and a binary skeleton is
// bytes, so it has its own entry point (`parseSpineSkeletonBinary`) exactly as `parseGlb` sits beside
// `parseGltf` rather than behind a text detector.
function detectSpine(text: string): boolean {
  if (text.trimStart()[0] !== '{') return false;
  return /"bones"\s*:/.test(text) || /"skeleton"\s*:/.test(text) || /"slots"\s*:/.test(text);
}

// A sorted snapshot of every bound skeleton-format kind. Detection retains registration precedence
// separately; this enumeration is stable for callers and agrees with resolution after removal.
export function getSkeleton2DFormatKinds(): readonly string[] {
  const kinds: string[] = [];
  getRegistryTableKeys(kinds, getRegistry());
  return kinds;
}

// Auto-detects the skeleton format of `text` and parses it, threading the optional diagnostics sink.
// Returns the sentinel `null` when no registered format recognizes the input (the expected
// "unrecognized format" failure) or the recognized parser itself rejects it.
export function parseSkeleton2D(text: string, diagnostics?: ImportDiagnostic[]): Skeleton2DImport | null {
  for (const registered of getSkeleton2DFormatsInDetectionOrder()) {
    if (registered.entry.detect(text)) return registered.entry.parse(text, diagnostics);
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
  bindSkeleton2DFormat(kind, detect, parse);
}

// Removes a registered format, so the registry is not write-only. Every other registry in the SDK pairs
// its `register*` with this — a caller that can add a vendor format must be able to take it back out, and
// a test that registers one has no way to leave the module global as it found it otherwise.
export function unregisterSkeleton2DFormat(kind: string): void {
  _registry = withoutRegistryTableEntry(getRegistry(), kind);
}

function bindSkeleton2DFormat(
  kind: string,
  detect: (text: string) => boolean,
  parse: (text: string, diagnostics?: ImportDiagnostic[]) => Skeleton2DImport | null,
): void {
  const registry = getRegistry();
  const current = getRegistryTableEntry(registry, kind);
  _registry = withRegistryTableEntry(registry, kind, {
    entry: { detect, parse },
    order: current?.order ?? _nextFormatOrder++,
  });
}

function getSkeleton2DFormatsInDetectionOrder(): RegisteredSkeletonFormat[] {
  const formats: RegisteredSkeletonFormat[] = [];
  for (const kind of getSkeleton2DFormatKinds()) {
    const registered = getRegistryTableEntry(getRegistry(), kind);
    if (registered !== null) formats.push(registered);
  }
  formats.sort((a, b) => a.order - b.order);
  return formats;
}

let _registry: KeyedTable<RegisteredSkeletonFormat> | null = null;
let _nextFormatOrder = 0;
