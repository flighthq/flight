import type { Material } from './Material';

// The 2D branch of the material hierarchy, parallel to Node2D on the node side. It adds no fields
// beyond Material today: its job is to make dimensionality part of the TYPE, so an attachment point
// can say which branch it accepts. HasMaterial.material is `Material2D | null`, which turns
// "PhongMaterial on a sprite" from a confusing missing-renderer diagnostic at draw time into a
// compile error at the assignment.
//
// Deliberately field-free rather than collapsed into Material: a 2D-only field added later lands here
// without touching the 3D subsystem, and the empty interface is what lets the render proxies narrow
// (RenderProxy2D.material) without a runtime discriminant on Material.
export interface Material2D extends Material {}
