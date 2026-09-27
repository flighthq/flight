// Static scenery: materials and geometry, in the order the full family runs them. No cameras, lights, controllers
// or animations, so @flighthq/camera, @flighthq/lighting and @flighthq/animation stay out of the module graph.
// ★ THE SELECTIVE PATH IS `parseColladaWithDecoders`, NOT `parseCollada`. Measured: with `parseCollada` these four
// fixtures came out within 18 bytes of each other, because `parseCollada` resolves its default from
// `colladaAllElementDecoders` and so names every decoder whatever a caller passes. Keeping that default is
// deliberate — asking for everything should cost everything — so the selective entry point is the one that takes
// the family and names no preset. Same shape as `parseAwd2`, which takes its handlers and has no default at all.
import { colladaGeometryDecoder, colladaMaterialDecoder, parseColladaWithDecoders } from '@flighthq/scene3d-formats';

export const result = parseColladaWithDecoders('<COLLADA/>', [colladaMaterialDecoder, colladaGeometryDecoder]);
