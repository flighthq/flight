import type { Awd2BlockHandler } from '@flighthq/types/contract';

import { awd2CameraHandler } from './awd2CameraHandler';
import { awd2TriangleGeometryHandler } from './awd2GeometryHandler';
import { awd2LightHandler, awd2LightPickerHandler } from './awd2LightingHandler';
import { awd2MaterialHandler, awd2TextureHandler } from './awd2MaterialHandler';
import { awd2ContainerHandler, awd2MeshInstanceHandler } from './awd2SceneStructureHandler';
import { awd2SkeletonAnimationHandler, awd2SkeletonBlockHandler, awd2SkeletonPoseHandler } from './awd2SkeletonHandler';

// The families a caller names blocks with, and the preset that names them all. Nothing in the importer
// imports this file: the block walk takes the handler array it was handed and reaches handlers only
// through that value, so a caller who names their own never links this module and never links the
// families they left out.
//
// A family is a plain array rather than a type of its own, so a caller who wants half of one — a skeleton
// without its animations, textures without material resolution — names the primitives they want instead
// of accepting the family wholesale.

// The camera block. A family of one, for symmetry with the others at a call site.
export const awd2CameraFamily: readonly Awd2BlockHandler[] = [awd2CameraHandler];

// Triangle geometry: the meshes everything else is drawn from.
export const awd2GeometryFamily: readonly Awd2BlockHandler[] = [awd2TriangleGeometryHandler];

// Lights and the pickers that scope them.
export const awd2LightingFamily: readonly Awd2BlockHandler[] = [awd2LightHandler, awd2LightPickerHandler];

// Materials and the textures they sample.
export const awd2MaterialsFamily: readonly Awd2BlockHandler[] = [awd2MaterialHandler, awd2TextureHandler];

// Containers and mesh instances: the hierarchy and the drawables seated in it.
export const awd2SceneStructureFamily: readonly Awd2BlockHandler[] = [awd2ContainerHandler, awd2MeshInstanceHandler];

// The skeleton block read on the first pass, and the pose and animation blocks read on the second.
export const awd2SkeletonFamily: readonly Awd2BlockHandler[] = [
  awd2SkeletonBlockHandler,
  awd2SkeletonPoseHandler,
  awd2SkeletonAnimationHandler,
];

/**
 * Every block handler Flight reads an AWD2 file with — the full-support preset, which reproduces the
 * importer's complete behavior.
 *
 * The order is load-bearing and is the order the retired named-slot registry declared: materials,
 * skeleton, geometry, scene structure, lighting, camera. Build phases run in array order and genuinely
 * depend on each other — materials install the resolver scene structure reads, the skeleton builds the
 * joint nodes mesh instances bind to, scene structure creates the nodes lighting and camera parent
 * themselves to. Reordering silently produces unparented lights or unskinned meshes, which is why the
 * order lives here as one declaration rather than as an emergent property of six files.
 */
export const awd2AllBlockHandlers: readonly Awd2BlockHandler[] = [
  ...awd2MaterialsFamily,
  ...awd2SkeletonFamily,
  ...awd2GeometryFamily,
  ...awd2SceneStructureFamily,
  ...awd2LightingFamily,
  ...awd2CameraFamily,
];
