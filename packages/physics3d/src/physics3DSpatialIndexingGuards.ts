import type { Physics3DWorld } from '@flighthq/types/contract';

// The core-side seam for physics3d's spatial outcome diagnostics. It is deliberately local rather than
// installing spatial's global caller-composed guard: doing that would overwrite application policy and
// receive notices from every unrelated 2D and 3D index in the process.
export function reportPhysics3DSpatialIndexing(world: Readonly<Physics3DWorld>): void {
  physics3DSpatialIndexingGuard?.(world);
}

export function setPhysics3DSpatialIndexingGuard(guard: ((world: Readonly<Physics3DWorld>) => void) | null): void {
  physics3DSpatialIndexingGuard = guard;
}

let physics3DSpatialIndexingGuard: ((world: Readonly<Physics3DWorld>) => void) | null = null;
