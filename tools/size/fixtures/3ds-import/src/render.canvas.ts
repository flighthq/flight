// The 3DS importer with every chunk handler named — what a build pays when it asks for everything.
//
// Its pair, 3ds-import-static, names only the mesh and material families a static scene needs. The
// difference between them is what a caller saves by not naming cameras, lights, and keyframes, and
// it is the number that says whether the chunk-handler boundary is load-bearing or decorative.
import { parse3ds, threeDsAllChunkHandlers } from '@flighthq/scene3d-formats';

// A document the importer rejects at the header still walks every reachable branch of the module
// graph, which is what the measurement needs; decoding real bytes would only add fixture weight.
export const document = parse3ds(new Uint8Array([0x4d, 0x4d]), undefined, {
  handlers: threeDsAllChunkHandlers,
});
