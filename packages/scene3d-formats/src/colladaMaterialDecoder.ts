import type { ColladaElementDecoder } from '@flighthq/types/contract';

import { appendColladaMaterials } from './colladaMaterial.ts';

/**
 * The decoder for each COLLADA feature, as values a caller composes.
 *
 * ★ EACH ONE WRAPS THE PATH THAT ALREADY EXISTED. The material, camera, controller, animation and light
 * decoders call exactly the functions `parseCollada` called inline, in the order it called them; the
 * geometry decoder holds the block that used to sit in the middle of that function, moved without edits.
 * Nothing about how a COLLADA file is read changed — only who gets to choose what is read.
 *
 * ★ THE ORDER IN `colladaAllElementDecoders` IS LOAD-BEARING. Materials run before geometry because a
 * primitive names a material symbol the material pass has to have indexed first, and every decoder runs
 * before the scene builder because a node instantiates a mesh by the index geometry assigned it. The
 * array preserves the sequence the single function used; a family in another order is a different parse,
 * not a reordering of the same one.
 *
 * Omitting a decoder leaves its map empty, and the scene builder treats an absent id exactly as it
 * already treats one the document never declared — which is why a partial family yields a smaller scene
 * rather than a broken one.
 *
 * Nothing here registers itself. A decoder is a plain value; importing one starts nothing.
 */
export const colladaMaterialDecoder: ColladaElementDecoder = {
  decode(context) {
    appendColladaMaterials(
      context.root,
      context.document.materials,
      context.document.resources,
      context.materialIndices,
      context.baseUrl,
      context.diagnostics,
    );
  },
  elements: ['material', 'effect'],
  features: ['Material', 'Effect.Blinn', 'Effect.Lambert', 'Effect.Phong', 'Image'],
};
