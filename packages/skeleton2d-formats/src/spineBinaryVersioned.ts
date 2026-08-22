import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { ImportDiagnostic, Skeleton2DImport, SpineBinaryParser } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { getSpineBinaryVersion } from './spineBinaryVersion';

// The Spine `.skel` VERSION REGISTRY — layer 3 of the version-keyed import model
// (agents/version-keyed-import-model.md). Probe, look up, delegate. It owns no record layout of its own.
//
// ★ THE REGISTRY CONTENTS ARE THE GATE. This replaces a `version.startsWith('4.')` prefix test, which was
// a promise about layouts that did not exist yet — and it was wrong: 23 real 4.2.22 exports were admitted
// into a reader built for 4.1, desynchronized at once, and produced a Skeleton2DImport with ZERO BONES from
// a 64 KB file. Not a crash and not a refusal: a valid-looking success containing nothing, which a caller
// cannot tell from a skeleton that genuinely has no bones. An unregistered version is refused here with its
// real version string in the crumb, and registering one means implementing its layout.
//
// Registration is explicit and never happens at module top level, so `"sideEffects": false` holds and only
// the versions an application registers are bundled.

/**
 * Parses a `.skel` by dispatching on the version its header declares.
 *
 * Two refusals, and the difference between them is load-bearing for conformance:
 * `spine.binary-header-unreadable` means the file may not be a Spine binary at all (an unknown-unknown),
 * while `spine.binary-version-unsupported` means the importer knows exactly what the file is and has no
 * layout for it (a known-unknown) — and it carries the version so a scorer can tell "3.8, known
 * unimplemented" from "99.0, unknown format".
 */
export function parseSpineSkeletonBinaryVersioned(
  bytes: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
): Skeleton2DImport | null {
  const version = getSpineBinaryVersion(bytes);
  if (version === null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'spine.binary-header-unreadable',
      'parseSpineSkeletonBinaryVersioned',
      { bytes: bytes.byteLength },
    );
    return null;
  }
  const parser = _parsers.get(toSpineBinaryLayoutKey(version));
  if (parser === undefined) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'spine.binary-version-unsupported',
      'parseSpineSkeletonBinaryVersioned',
      { version },
    );
    return null;
  }
  return parser(bytes, diagnostics);
}

/**
 * Registers the parser for one `major.minor` wire layout — `registerSpineSkeletonBinaryParser('4.1', …)`.
 *
 * Last-write-wins, matching the renderer registry, so an application can substitute its own parser for a
 * version Flight already ships. Call it from application setup, never at module scope.
 */
export function registerSpineSkeletonBinaryParser(version: string, parser: SpineBinaryParser): void {
  _parsers.set(toSpineBinaryLayoutKey(version), parser);
}

/**
 * The `major.minor` key a full version string registers and dispatches under.
 *
 * Exported because the registry key must be derivable by callers rather than guessed: a caller registering
 * `'4.1.17'` and a file declaring `'4.1.20'` have to land on the same entry, and the only way that is
 * checkable from outside is if the folding rule is the same function both sides call. A version with no
 * minor is returned unchanged rather than padded — it is not a layout key this registry can honour, and
 * inventing `.0` would silently dispatch it to a layout nobody claimed.
 */
export function toSpineBinaryLayoutKey(version: string): string {
  const parts = version.split('.');
  if (parts.length < 2) return version;
  return `${parts[0]}.${parts[1]}`;
}

const _parsers = new Map<string, SpineBinaryParser>();
