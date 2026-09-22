import type { Awd2BlockHandler, Awd2BlockRegistry } from '@flighthq/types/contract';

import { composeAwd2BlockHandlers, createAwd2BlockRegistry } from './awd2BlockDispatch';
import { awd2CameraHandler } from './awd2CameraHandler';
import { awd2TriangleGeometryHandler } from './awd2GeometryHandler';
import { awd2LightHandler, awd2LightPickerHandler } from './awd2LightingHandler';
import { awd2MaterialHandler, awd2TextureHandler } from './awd2MaterialHandler';
import { awd2ContainerHandler, awd2MeshInstanceHandler } from './awd2SceneStructureHandler';
import { awd2SkeletonAnimationHandler, awd2SkeletonBlockHandler, awd2SkeletonPoseHandler } from './awd2SkeletonHandler';

// The one file that names every handler, and therefore the one edge by which a build can acquire all six
// families. Nothing in the importer imports it: the block walk takes a registry it was handed and reaches
// handlers only through that value, so a caller who assembles their own never links this module and never
// links the families they left out.
//
// The families below are compositions rather than types of their own, so a caller who wants half of one —
// a skeleton without its animations, textures without material resolution — composes the primitives they
// want instead of accepting the family wholesale.

// Lights and the pickers that scope them.
export function awd2LightingFamily(): Awd2BlockHandler {
  return composeAwd2BlockHandlers(awd2LightHandler, awd2LightPickerHandler);
}

// Materials and the textures they sample.
export function awd2MaterialsFamily(): Awd2BlockHandler {
  return composeAwd2BlockHandlers(awd2MaterialHandler, awd2TextureHandler);
}

// Containers and mesh instances: the hierarchy and the drawables seated in it.
export function awd2SceneStructureFamily(): Awd2BlockHandler {
  return composeAwd2BlockHandlers(awd2ContainerHandler, awd2MeshInstanceHandler);
}

// The skeleton block read on the first pass, and the pose and animation blocks read on the second.
export function awd2SkeletonFamily(): Awd2BlockHandler {
  return composeAwd2BlockHandlers(awd2SkeletonBlockHandler, awd2SkeletonPoseHandler, awd2SkeletonAnimationHandler);
}

// Every family, which is what reproduces the importer's full behavior. A caller who wants less builds the
// registry themselves and pays for nothing they left out.
export function createAwd2DefaultBlockRegistry(): Awd2BlockRegistry {
  return createAwd2BlockRegistry({
    camera: awd2CameraHandler,
    geometry: awd2TriangleGeometryHandler,
    lighting: awd2LightingFamily(),
    materials: awd2MaterialsFamily(),
    sceneStructure: awd2SceneStructureFamily(),
    skeleton: awd2SkeletonFamily(),
  });
}
