import type { ImportDiagnostic, ImportDiagnosticSeverity } from './ImportDiagnostic.ts';
import type { Md5Joint } from './Md5Schema.ts';
import type { Scene3DDocument } from './Scene3DDocument.ts';

/**
 * One accumulated MD5 line-level drop: a total occurrence `count` plus the first offender's `detail`, keyed
 * by kind + discriminator. Flushed once at the end of a parse pass, so fifty malformed lines collapse to
 * one diagnostic carrying a count rather than fifty crumbs.
 */
export interface Md5DropTally {
  count: number;
  detail: Record<string, boolean | number | string>;
  kind: string;
  severity: ImportDiagnosticSeverity;
}

/**
 * The `mesh { }` section currently being assembled.
 *
 * `shader` is the section's own `shader` line — the material/texture path MD5 names — and is `''` when the
 * section declares none. `materials` is that mesh's material index list, which a handler appends to.
 */
export interface Md5MeshSection {
  readonly materials: number[];
  readonly shader: string;
}

/**
 * What an MD5 section handler is handed.
 *
 * ★ TWO DISPATCH POINTS, NOT ONE, because MD5's two optional features do not occur at the same place. The
 * `joints { }` block appears once per file and must be emitted before any mesh binds its skin, so handlers
 * claiming `Skeleton` run once with `mesh` null. A `mesh { }` block repeats and names its shader per
 * section, so handlers claiming `Material` run once per block with `mesh` set. Reading `mesh` tells a
 * handler which point it is at.
 */
export interface Md5ParseContext {
  readonly diagnostics: ImportDiagnostic[] | undefined;
  readonly document: Scene3DDocument;
  /** The aggregation table line-level faults are tallied into, or null when nothing collects diagnostics. */
  readonly drops: Map<string, Md5DropTally> | null;
  /** The file's joints, empty when it declares no skeleton. */
  readonly joints: readonly Md5Joint[];
  /** The mesh section being assembled, or null at the file-level dispatch. */
  readonly mesh: Md5MeshSection | null;
  /**
   * The skin index every mesh section binds, or null when no skeleton was emitted.
   *
   * Written by the handler that emits the skeleton and read when each mesh is assembled, which is why it is
   * the one mutable field here: the two are different dispatch points and the value has to cross between
   * them.
   */
  skin: number | null;
}

/**
 * One MD5 section handler — the unit of opt-in for the MD5 mesh importer.
 *
 * MD5 is text-delimited, so a handler reads one block keyword — but what it DECLARES is the `feature` it
 * satisfies (`Material`, `Skeleton`), which is the vocabulary `collectMd5MeshFeatures` reports and
 * `parseMd5MeshRequirements` emits under `document.format`.
 *
 * ★ THE FEATURE NAME, NOT THE BLOCK KEYWORD. They differ: `joints {` is the block, `Skeleton` is the
 * feature; a `shader` line inside `mesh {` is the block detail, `Material` is the feature. Declaring the
 * feature is what lets a catalog row be DERIVED from the shipped family by identity rather than transcribed
 * beside it.
 *
 * A handler is a plain value; importing one starts nothing.
 */
export interface Md5SectionHandler {
  readonly feature: string;
  collect(context: Md5ParseContext): void;
}

/** The feature a handler claims to read the `shader` line of each `mesh { }` block for. */
export const MD5_MATERIAL_FEATURE = 'Material';

/** The feature a handler claims to emit the `joints { }` block as document nodes and a skin for. */
export const MD5_SKELETON_FEATURE = 'Skeleton';

/**
 * What `parseMd5Mesh` accepts beyond the source text.
 *
 * ★ ONLY ONE OF THE TWO SECTIONS IS A DEPENDENCY BOUNDARY, and saying so is more useful than implying both
 * are. Omitting the material handler is what keeps `@flighthq/materials` and the texture-reference
 * machinery out of the build — a real package saved. Omitting the skeleton handler saves no package,
 * because the geometry it shares `@flighthq/geometry` with is needed either way; what it drops is the joint
 * nodes and the skin, which is a content choice for a caller who wants the bind pose alone.
 *
 * Leaving `sectionHandlers` undefined runs the full standard family, which reproduces the parse this
 * function performed when both sections were read unconditionally.
 */
export interface Md5ImportOptions {
  readonly sectionHandlers?: readonly Readonly<Md5SectionHandler>[];
}
