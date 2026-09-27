// An animated character: geometry, materials, skinning and animation — but no cameras and no lights, which a
// character asset does not carry. The pair with collada-import-static isolates what controllers and animation cost.
// ★ THE SELECTIVE PATH IS `parseColladaWithDecoders`, NOT `parseCollada`. Measured: with `parseCollada` these four
// fixtures came out within 18 bytes of each other, because `parseCollada` resolves its default from
// `colladaAllElementDecoders` and so names every decoder whatever a caller passes. Keeping that default is
// deliberate — asking for everything should cost everything — so the selective entry point is the one that takes
// the family and names no preset. Same shape as `parseAwd2`, which takes its handlers and has no default at all.
import {
  colladaAnimationDecoder,
  colladaControllerDecoder,
  colladaGeometryDecoder,
  colladaMaterialDecoder,
  parseColladaWithDecoders,
} from '@flighthq/scene3d-formats';

export const result = parseColladaWithDecoders('<COLLADA/>', [
  colladaMaterialDecoder,
  colladaGeometryDecoder,
  colladaControllerDecoder,
  colladaAnimationDecoder,
]);
