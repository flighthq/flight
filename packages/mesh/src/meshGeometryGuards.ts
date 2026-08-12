import type { MeshGeometry, MeshGeometryUvWrapGuard } from '@flighthq/types/contract';

/**
 * The seam this package's silent behaviour reports through.
 *
 * Core holds the slot and nothing else — no message, no logger, no dependency on one, and no walk over the
 * geometry. `enableMeshGeometryGuards` is what fills the slot, and until a caller opts in `reportMeshGeometryUvWrap`
 * is a null check and a return. That is the diagnostics inversion rule: the seam lives with the code that knows
 * the moment, the wording and the cost live in a module a shipped build never has to import.
 *
 * The slot is set rather than accumulated, so enabling twice installs one guard rather than two.
 */
export function reportMeshGeometryUvWrap(geometry: Readonly<MeshGeometry>): void {
  if (_uvWrapGuard === null) return;
  _uvWrapGuard(geometry);
}

export function setMeshGeometryUvWrapGuard(guard: MeshGeometryUvWrapGuard | null): void {
  _uvWrapGuard = guard;
}

let _uvWrapGuard: MeshGeometryUvWrapGuard | null = null;
