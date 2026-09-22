// The AWD2 importer with every block family named — what a build pays when it asks for everything.
//
// Its pair, awd2-import-static, names only the three families a static scene needs. The difference
// between them is what a caller saves by not naming skeletons, lights and cameras, and it is the number
// that says whether the block-handler boundary is load-bearing or decorative. Both fixtures build a host
// the same way, so the host's own cost cancels in that difference.
import { createHost } from '@flighthq/host/contract';
import { awd2AllBlockHandlers, parseAwd2 } from '@flighthq/scene3d-formats';

// A document the importer rejects at the header still walks every reachable branch of the module graph,
// which is what the measurement needs; decoding real bytes would only add fixture weight. The host
// carries no decompression: an uncompressed AWD header never reaches a codec.
export const document = parseAwd2(new Uint8Array([0x41, 0x57, 0x44]), {
  blocks: awd2AllBlockHandlers,
  host: createHost(),
});
