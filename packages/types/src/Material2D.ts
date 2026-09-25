import type { Material, MaterialDimensionKey } from './Material.ts';

// The 2D branch of the material hierarchy, parallel to Node2D on the node side. It adds no fields
// beyond Material today: its job is to make dimensionality part of the TYPE, so an attachment point
// can say which branch it accepts. HasMaterial.material is `Material2D | null`, which turns
// "PhongMaterial on a sprite" from a confusing missing-renderer diagnostic at draw time into a
// compile error at the assignment.
//
// Carries no DATA of its own: a 2D-only field added later lands here without touching the 3D
// subsystem. Its only member is the phantom dimension key, which is what lets the attachment points
// and render proxies reject the wrong branch without a runtime discriminant on Material.
export interface Material2D extends Material {
  // Phantom only — see MaterialDimensionKey. Never present at runtime.
  readonly [MaterialDimensionKey]?: '2d';
}
