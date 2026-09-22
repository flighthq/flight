// The same importer as awd2-import, registering three block families instead of six: geometry, the scene
// hierarchy, and materials. This is the case the decomposition exists to serve — static scenery, with no
// skeleton, light or camera blocks read and none of the packages behind them linked.
//
// That @flighthq/animation, @flighthq/lighting and @flighthq/camera are absent from the module graph
// rather than merely unreferenced in it is asserted separately, by module and package reachability, in
// scripts/awd2-block-tree-shaking.test.ts. This fixture is the cost side of the same claim.
import {
  awd2ContainerHandler,
  awd2MaterialHandler,
  awd2MeshInstanceHandler,
  awd2TextureHandler,
  awd2TriangleGeometryHandler,
  composeAwd2BlockHandlers,
  createAwd2BlockRegistry,
  parseAwd2,
} from '@flighthq/scene3d-formats';

export const document = parseAwd2(
  new Uint8Array([0x41, 0x57, 0x44]),
  createAwd2BlockRegistry({
    geometry: awd2TriangleGeometryHandler,
    materials: composeAwd2BlockHandlers(awd2MaterialHandler, awd2TextureHandler),
    sceneStructure: composeAwd2BlockHandlers(awd2ContainerHandler, awd2MeshInstanceHandler),
  }),
  null,
  null,
);
