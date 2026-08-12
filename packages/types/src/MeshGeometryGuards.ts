import type { MeshGeometry } from './MeshGeometry';

/**
 * Installed by `enableMeshGeometryGuards`; called by `wrapMeshGeometryUvs` before it folds anything.
 *
 * This one is handed the geometry rather than a finished report, which is the opposite of the usual seam
 * shape and is the point: deciding whether a wrap tears means walking every primitive, and that walk must
 * not live in core where it would ship whether or not anyone opted in. Core's cost stays a null check, the
 * guard runs `explainMeshGeometryUvWrap` itself, and both the walk and the sentence shed with the module.
 *
 * It is called BEFORE the fold because the evidence is destroyed by it: afterwards every coordinate sits
 * in tile 0 and the straddle that was about to tear is no longer visible in the data.
 */
export type MeshGeometryUvWrapGuard = (geometry: Readonly<MeshGeometry>) => void;
