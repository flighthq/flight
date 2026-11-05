/**
 * One structured diagnostic from a `*-formats` importer — the replacement for the free-text
 * `warnings: string[]` idiom. An `ImportDiagnostic` is primarily a **dev/design signal**: it names a
 * place where the importer dropped, skipped, recovered, or rejected third-party input, so the SDK team
 * can *eliminate that gap*. It is not itself a runtime end-user message — it carries no text, only a
 * minimal machine tag.
 *
 * It is a **crumb**, recorded ONLY when a caller has engaged a collector (passes an `ImportDiagnostic[]`
 * sink to the parse — see `collectImportDiagnostics`). The default parse engages no collector, so the
 * colocated `reportImportDiagnostic` seam is near-free: one `undefined` check, no crumb built, no
 * allocation — the normal path is untouched in both speed and (measured) bundle size. The human text is
 * the second opt-in: `formatImportDiagnostic` (and per-package `explain*` message templates) *replay* a
 * crumb into words, and they are separately importable so a production bundle that never expands a crumb
 * sheds every byte of the text machinery. Because `explain*` replays the crumbs the parse itself emitted
 * — no re-parse, no re-walk — it can never drift from the parser.
 */
export interface ImportDiagnostic {
  /**
   * Plain-data context for the drop — indices, counts, byte offsets, block ids, names. Never
   * interpolated prose (the `kind` carries the stable identity; identifying values go here so tests and
   * agents can assert on them structurally).
   */
  detail?: Readonly<Record<string, boolean | number | string>>;
  /**
   * A stable, greppable machine code, dot-namespaced by format:
   * `'awd2.skin-vertex-mismatch'`, `'gltf.accessor-out-of-bounds'`, `'md2.triangle-index-out-of-range'`.
   * The kind string is a **value colocated at the drop site**, never a member of a central registry — a
   * registry would drift out of sync and encode stale "can't do X" claims that survive after X is built.
   * Removing the drop branch removes its kind; nothing else references it.
   */
  kind: string;
  /**
   * The name of the function that actually emitted the diagnostic (the true origin), not the public
   * wrapper that was called. Fixes the misattribution of the old hand-prefixed `"<wrapper>: message"`
   * convention, where a shared helper's warning named whichever entry point happened to invoke it.
   */
  origin: string;
  /** The outcome axis — what the importer did with the offending input. See `ImportDiagnosticSeverity`. */
  severity: ImportDiagnosticSeverity;
}

/**
 * What an importer did with input it could not fully honor. Orthogonal to `kind` (which names the
 * specific site): the tolerant-but-loud policy is "never throw on bad third-party data, always record".
 *
 * - `Drop`: data was lost — a vertex stream, a layer, a frame record silently discarded. The highest-value
 *   signal: a branch to eliminate.
 * - `Skip`: a recognized-but-unsupported feature was ignored (an unimplemented extension, an unmapped
 *   method). A capability gap, not a data-integrity bug.
 * - `Recover`: the importer degraded but continued with a substitute (an identity pose for a missing
 *   pose block, an all-zero grid for an unavailable decompressor).
 * - `Reject`: the whole input was refused and a sentinel returned (bad magic, unsupported version,
 *   truncated header, malformed JSON).
 *
 * A closed, Flight-owned enumerable: a `const` namespace with a PascalCase value union (the value IS the
 * serialized string and ports to a C/C++ `enum class` with no re-casing). The user writes
 * `ImportDiagnosticSeverity.Drop`. Reporting is never a hot loop, so consumers switch on it directly.
 */
export const ImportDiagnosticSeverity = {
  Drop: 'Drop',
  Recover: 'Recover',
  Reject: 'Reject',
  Skip: 'Skip',
} as const;

export type ImportDiagnosticSeverity = (typeof ImportDiagnosticSeverity)[keyof typeof ImportDiagnosticSeverity];
