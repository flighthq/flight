import type { ImportDiagnostic, ImportDiagnosticSeverity } from '@flighthq/types/contract';

// The collector seam for importer diagnostics: where crumbs are recorded, and the opt-in that engages
// the recording. An `ImportDiagnostic[]` sink IS the collector — parsers write to it through
// `reportImportDiagnostic`; consumers create and drain one through `collectImportDiagnostics`.

// The opt-in engagement surface: runs `run` with a fresh collector installed and returns the crumbs it
// emitted, as plain data agents and tests can assert on. Engaging a collector is the ONLY thing that
// makes a parser record — the default parse (no collector) stays near-free and records nothing. Import
// it to inspect what an importer dropped/skipped/recovered/rejected; it and the text machinery it feeds
// (`formatImportDiagnostic`, per-package `explain*`) shed from a production bundle that never opts in.
//
// This is the importer analogue of an `explain*` query, but it COLLECTS during the single consume-once
// parse pass instead of re-walking the drop conditions in a duplicate implementation — so it can never
// drift out of sync with the parser the way a hand-mirrored explainer would.
//
// Usage: `collectImportDiagnostics((sink) => parseAwd2(bytes, sink))`.
export function collectImportDiagnostics(run: (sink: ImportDiagnostic[]) => void): ImportDiagnostic[] {
  const diagnostics: ImportDiagnostic[] = [];
  run(diagnostics);
  return diagnostics;
}

// The colocated seam every `*-formats` parser calls at a data-dropping branch. When `sink` is
// undefined — the default parse path, where no caller engaged a collector — it does nothing, so an
// unopted parse pays only this single `undefined` check and no crumb is built or allocated. `kind` is a
// stable dot-namespaced code that lives here at the drop site (never a central registry, so it vanishes
// when the branch is removed); `origin` is the emitting function's own name (the true origin, not a
// wrapper); `detail` is a minimal plain-data tag, never prose (the words live in `formatImportDiagnostic`).
//
// PERF CONTRACT (the normal path must not slow): the call sits INSIDE the drop branch, so a well-formed
// parse never reaches it. In a HOT LOOP (per-vertex/per-element validation) do NOT call this per element
// — aggregate the offenders and report once after the loop (a count in `detail`), so no engaged-or-not
// per-element seam cost exists. `detail` is evaluated by the caller before the call, so keep it a small
// literal built only within the (rare, non-hot) drop branch.
export function reportImportDiagnostic(
  sink: ImportDiagnostic[] | undefined,
  severity: ImportDiagnosticSeverity,
  kind: string,
  origin: string,
  detail?: Readonly<Record<string, boolean | number | string>>,
): void {
  if (sink === undefined) return;
  sink.push({ detail, kind, origin, severity });
}
