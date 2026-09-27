// The COLLADA importer with every decoder named — what a build pays when it asks for everything.
//
// Its three siblings name subsets. The differences between them are what the decomposition bought, and they are the
// numbers that say whether the decoder boundary is load-bearing or decorative.
import { colladaAllElementDecoders, parseCollada } from '@flighthq/scene3d-formats';

export const result = parseCollada('<COLLADA/>', { decoders: colladaAllElementDecoders });
