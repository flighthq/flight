// MD2 with the skin family only: a static textured model, no clips.
// ★ THE SELECTIVE ENTRY IS `parseMd2WithSectionHandlers`, which reads with the handlers it is given and names no preset.
import { parseMd2WithSectionHandlers, md2SkinFamily } from '@flighthq/scene3d-formats';

export const result = parseMd2WithSectionHandlers(new Uint8Array(), undefined, md2SkinFamily);
