import { disposeNode } from '@flighthq/node';
import type { SceneNode } from '@flighthq/types';

// Detaches `node` from its parent (if any), recursively disposes all descendants bottom-up,
// clears signal/observer registries, and releases graph state so the subtree becomes eligible for
// garbage collection.
//
// After `disposeSceneNode`, `node` must not be re-added to a graph. GPU resources (mesh geometry
// uploads, render proxies) are not freed here — they are non-GC resources owned by the render
// packages; call the appropriate `destroy*` function on the render state before or after disposing.
//
// Note: `dispose*` (detach and release to GC) vs `destroy*` (free a non-GC resource immediately).
// This function implements the `dispose*` contract: no GPU or native handles are released here.
export function disposeSceneNode(node: SceneNode): void {
  disposeNode(node);
}
