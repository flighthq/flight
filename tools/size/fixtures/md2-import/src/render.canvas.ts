// MD2 with the full preset — the control the subsets are priced against.
// ★ THE SELECTIVE ENTRY IS `parseMd2WithSectionHandlers`, which reads with the handlers it is given and names no preset.
import { parseMd2WithSectionHandlers, md2AllSectionHandlers } from '@flighthq/scene3d-formats';

export const result = parseMd2WithSectionHandlers(new Uint8Array(), undefined, md2AllSectionHandlers);
