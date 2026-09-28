// MD2 with the animation family only: the frame clips, untextured.
// ★ THE SELECTIVE ENTRY IS `parseMd2WithSectionHandlers`, which reads with the handlers it is given and names no preset.
import { parseMd2WithSectionHandlers, md2AnimationFamily } from '@flighthq/scene3d-formats';

export const result = parseMd2WithSectionHandlers(new Uint8Array(), undefined, md2AnimationFamily);
