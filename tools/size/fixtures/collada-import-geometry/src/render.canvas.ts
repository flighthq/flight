// Geometry alone: the smallest useful COLLADA import. No materials, cameras, lights, controllers or animations —
// and none of the packages behind them, which is the claim this fixture prices.
// ★ THE SELECTIVE PATH IS `parseColladaWithDecoders`, NOT `parseCollada`. Measured: with `parseCollada` these four
// fixtures came out within 18 bytes of each other, because `parseCollada` resolves its default from
// `colladaAllElementDecoders` and so names every decoder whatever a caller passes. Keeping that default is
// deliberate — asking for everything should cost everything — so the selective entry point is the one that takes
// the family and names no preset. Same shape as `parseAwd2`, which takes its handlers and has no default at all.
import { colladaGeometryDecoder, parseColladaWithDecoders } from '@flighthq/scene3d-formats';

export const result = parseColladaWithDecoders('<COLLADA/>', [colladaGeometryDecoder]);
