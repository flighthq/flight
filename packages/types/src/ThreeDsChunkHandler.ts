import type { ImportDiagnostic } from './ImportDiagnostic.ts';
import type { Scene3DDocument } from './Scene3DDocument.ts';
import type { ThreeDsDropTally } from './ThreeDsSchema.ts';
import type { ThreeDsCamera, ThreeDsLight, ThreeDsMaterial, ThreeDsMesh } from './ThreeDsSchema.ts';

/**
 * One 3DS chunk-type handler — the unit of opt-in for the 3DS importer.
 *
 * The 3DS format is a recursive chunk tree, not a flat block stream. Feature chunks (TRIMESH,
 * MATERIAL, LIGHT, CAMERA, KEYFRAME_OBJECT_NODE) live at different depths of the tree, so the
 * handler does not walk — a tree walker locates the chunk and calls the handler for its claimed IDs.
 *
 * A handler claims chunk IDs (the uint16 values at the start of each 3DS chunk) and provides a
 * `collect` function that reads one chunk into the shared parse state, plus an optional `build`
 * function that assembles the collected data into the document. The two-phase split follows the
 * AWD2 handler pattern: `collect` runs once per chunk during the tree walk; `build` runs once
 * after the walk completes, when every handler's data is in place and cross-family references
 * (material names, keyframe pivots) can be resolved.
 */
export interface ThreeDsChunkHandler {
  readonly chunkIds: readonly number[];
  build?(state: ThreeDsParseState): void;
  collect(state: ThreeDsParseState, view: Readonly<DataView>, offset: number, end: number, name: string): void;
}

/**
 * Shared parse state for a 3DS import — the collectors every handler writes into.
 *
 * The tree walker locates feature chunks and calls each handler's `collect`; handlers populate the
 * collectors here. After the walk, the dispatcher calls each handler's `build` (when present) to
 * assemble the collected data into the document — resolving material references by name, applying
 * keyframe pivots, and emitting cameras and lights.
 */
export interface ThreeDsParseState {
  readonly cameras: ThreeDsCamera[];
  readonly diagnostics: ImportDiagnostic[] | undefined;
  /**
   * The aggregation table per-chunk faults are tallied into, or null when nothing collects diagnostics.
   *
   * ★ HANDLERS MUST THREAD THIS, NOT PASS NULL. A 3DS file with fifty malformed faces produces one crumb
   * with a count, not fifty — `parse3ds` is the single physical emitter and flushes the tallies once at
   * the end. A handler that passed `null` to the parser it wraps would silently discard every per-chunk
   * fault it saw, so the handler-driven path would report FEWER diagnostics than the monolithic one on
   * the same bytes. That is exactly the observable difference a refactor is supposed not to introduce.
   */
  readonly drops: Map<string, ThreeDsDropTally> | null;
  readonly document: Scene3DDocument;
  readonly lights: ThreeDsLight[];
  readonly materials: Map<string, ThreeDsMaterial>;
  readonly meshes: ThreeDsMesh[];
  readonly pivots: Map<string, readonly [number, number, number]>;
}

export type ThreeDsChunkDispatch = ReadonlyMap<number, Readonly<ThreeDsChunkHandler>>;

/**
 * What `parse3ds` accepts beyond the bytes.
 *
 * ★ THE HANDLER FAMILY IS THE TREE-SHAKING BOUNDARY. Naming a subset is what keeps the code behind a
 * feature out of a build that does not use it: a file read only for its meshes should not pay for camera,
 * light or keyframe parsing. Leaving `handlers` undefined runs the full standard family, which reproduces
 * the parse this function performed when the dispatch was hard-coded.
 *
 * ORDER IS PRESERVED as given. The standard family is ordered to match the chunk tree's own sequence, and
 * a caller reordering it is describing a different parse rather than the same one rearranged.
 */
export interface ThreeDsImportOptions {
  readonly handlers?: readonly Readonly<ThreeDsChunkHandler>[];
}
