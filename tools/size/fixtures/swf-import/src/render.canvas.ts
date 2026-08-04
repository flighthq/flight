// The SWF codec and nothing else. It exists to measure one thing the example suite structurally cannot:
// @flighthq/swf depends on adjustments, effects and math to turn a placement's colour transform and filter
// list into descriptors, and AGENTS.md's bundle invariant says an assembly never inflates the bundle cost
// of a primitive. No measured example imports swf, so without this fixture those three edges are
// unmeasured rather than verified.
import { createScene2DFromSwf } from '@flighthq/swf';

// A document the importer rejects at the header still walks every reachable branch of the module graph,
// which is what the measurement needs; decoding real bytes would only add fixture weight.
export const document = createScene2DFromSwf(new Uint8Array([0x46, 0x57, 0x53]));
