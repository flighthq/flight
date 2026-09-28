// MD5 geometry alone: the vertex, triangle and weight records, with neither the skeleton nor the material family.
// ★ THE SELECTIVE ENTRY IS `parseMd5MeshWithSectionHandlers`, which reads with the handlers it is given and names no
// preset. The zero-config `parseMd5Mesh` costs both families by construction.
import { parseMd5MeshWithSectionHandlers } from '@flighthq/scene3d-formats';

export const result = parseMd5MeshWithSectionHandlers('MD5Version 10\n', undefined, []);
