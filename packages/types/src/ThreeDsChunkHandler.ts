import type { ImportDiagnostic } from './ImportDiagnostic.ts';
import type { Scene3DDocument } from './Scene3DDocument.ts';
import type { ThreeDsCamera, ThreeDsLight, ThreeDsMaterial, ThreeDsMesh } from './ThreeDsSchema.ts';

/**
 * One 3DS chunk-type handler — the unit of opt-in for the 3DS importer.
 *
 * The 3DS format is a recursive chunk tree, not a flat block stream. Feature chunks (TRIMESH,
 * MATERIAL, LIGHT, CAMERA, KEYFRAME_OBJECT_NODE) live at different depths of the tree, so the
 * handler does not walk — a tree walker locates the chunk and calls the handler for its claimed IDs.
 *
 * A handler claims chunk IDs (the uint16 values at the start of each 3DS chunk) and provides a
 * `collect` function that reads one chunk into the shared parse state. Unlike AWD2's block handlers,
 * 3DS handlers do not have a separate `build` phase — the document is assembled after all chunks
 * have been collected, using the same material-name-resolution and pivot-application pass the
 * monolithic parser uses.
 */
export interface ThreeDsChunkHandler {
  readonly chunkIds: readonly number[];
  collect(state: ThreeDsParseState, view: Readonly<DataView>, offset: number, end: number, name: string): void;
}

/**
 * Shared parse state for a 3DS import — the collectors every handler writes into.
 *
 * The tree walker locates feature chunks and calls the handler for each; handlers populate the
 * collectors here. After the walk, a document-assembly step resolves material references by name,
 * applies keyframe pivots, and builds the Scene3DDocument — the same logic the monolithic parser
 * uses, now reachable from the handler-driven path.
 */
export interface ThreeDsParseState {
  readonly cameras: ThreeDsCamera[];
  readonly diagnostics: ImportDiagnostic[] | undefined;
  readonly document: Scene3DDocument;
  readonly lights: ThreeDsLight[];
  readonly materials: Map<string, ThreeDsMaterial>;
  readonly meshes: ThreeDsMesh[];
  readonly pivots: Map<string, Float32Array>;
}

export type ThreeDsChunkDispatch = ReadonlyMap<number, Readonly<ThreeDsChunkHandler>>;
