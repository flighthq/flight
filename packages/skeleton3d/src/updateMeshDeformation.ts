import { updateMeshMorph } from '@flighthq/scene3d/contract';
import type { Mesh } from '@flighthq/types/contract';

import { updateMeshSkin } from './updateMeshSkin.ts';

// Applies a mesh's CPU deformation in the one valid composition order: morph first, then skin. Each
// deformer remains a standalone primitive and is a no-op when absent; this small composition prevents
// callers from freezing the first morph into skin's captured input or accidentally reversing the two.
//
// The Mesh-level morph operation lives in @flighthq/scene3d; skin needs the joint palette, so it lives
// here. Composing them here preserves the same morph-first ordering as the Rust implementation.
// Backends using GPU skinning should continue to update morph CPU-side and upload the joint palette,
// rather than calling this CPU skin path and then skinning again in the shader.
export function updateMeshDeformation(mesh: Readonly<Mesh>): void {
  updateMeshMorph(mesh);
  updateMeshSkin(mesh);
}
