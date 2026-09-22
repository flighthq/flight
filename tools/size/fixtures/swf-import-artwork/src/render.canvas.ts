// The same importer as swf-import, naming four tag families instead of ten.
//
// swf-import measures what a SWF costs when a build asks for everything. This one measures what it costs
// when a build asks for authored artwork and nothing else, which is the case the tag-handler split exists
// to serve — and the pair is the measurement: the difference between them is what a caller saves by not
// naming scripting, audio, bitmaps, video, fonts and text, and it is the number that says whether the
// boundary is load-bearing or decorative.
//
// That the omitted families are absent from the module graph rather than merely unreferenced in it is
// asserted separately, by module and package reachability, in scripts/swf-tag-family-tree-shaking.test.ts.
// This fixture is the cost side of the same claim.
import {
  createScene2DFromSwf,
  swfControlTagFamily,
  swfPlacementTagFamily,
  swfShapeTagFamily,
  swfSpriteTagFamily,
} from '@flighthq/swf';

// A document the importer rejects at the header still walks every reachable branch of the module graph,
// which is what the measurement needs; decoding real bytes would only add fixture weight. No codec is named: an
// uncompressed FWS header never reaches one.
export const document = createScene2DFromSwf(new Uint8Array([0x46, 0x57, 0x53]), {
  tags: [...swfShapeTagFamily, ...swfSpriteTagFamily, ...swfControlTagFamily, ...swfPlacementTagFamily],
});
