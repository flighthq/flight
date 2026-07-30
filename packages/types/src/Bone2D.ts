import type { TransformInherit2D } from './TransformInherit2D';

// One bone in a Skeleton2D's flat, parent-before-child ordered bone array. It carries its LOCAL setup
// transform (the pose that animation mutates), its parent link, and its inherit mode. World transforms
// are derived from these by computeSkeleton2DWorldTransforms — skeleton2d owns and propagates the tree
// itself (unlike skeleton3d, whose joints are external Node3Ds it only reads), the Spine/DragonBones
// model.
//
// Angles are DEGREES (the authoring layer; converted to radians internally before any trig), matching
// the scene-graph 2D transform convention. `shearX`/`shearY` are the Spine skew angles in degrees (0 for
// no shear). `parentIndex` is the index of the parent bone in the same array, or -1 for a root; parents
// always precede children in the array so world propagation is one linear pass. `length` is the bone's
// length along its local +x axis (used by IK, path constraints, and debug draw; 0 when unused).
// `transformMode` is the per-axis inherit set (a `TransformMode2D` preset, or any `TransformInherit2D`).
export interface Bone2D {
  length: number;
  name?: string | null;
  parentIndex: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  shearX: number;
  shearY: number;
  transformMode: TransformInherit2D;
  x: number;
  y: number;
}
