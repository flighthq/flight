// MD2 geometry alone: the frame vertices and the single mesh, with neither the skin nor the animation family.
// ★ THE SELECTIVE ENTRY IS `parseMd2WithSectionHandlers`, which reads with the handlers it is given and names no preset.
import { parseMd2WithSectionHandlers } from '@flighthq/scene3d-formats';

export const result = parseMd2WithSectionHandlers(new Uint8Array(), undefined, []);
