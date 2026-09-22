// The AWD2 importer with every block family registered — what a build pays when it asks for everything.
//
// Its pair, awd2-import-static, registers only the three families a static scene needs. The difference
// between them is what a caller saves by not registering skeletons, lights and cameras, and it is the
// number that says whether the block-handler boundary is load-bearing or decorative.
import { createAwd2DefaultBlockRegistry, parseAwd2 } from '@flighthq/scene3d-formats';

// A document the importer rejects at the header still walks every reachable branch of the module graph,
// which is what the measurement needs; decoding real bytes would only add fixture weight.
export const document = parseAwd2(new Uint8Array([0x41, 0x57, 0x44]), createAwd2DefaultBlockRegistry(), null, null);
