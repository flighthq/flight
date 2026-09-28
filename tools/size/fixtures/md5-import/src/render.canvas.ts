// MD5 with the full preset — the control the subsets are priced against.
// ★ THE SELECTIVE ENTRY IS `parseMd5MeshWithSectionHandlers`, which reads with the handlers it is given and names no
// preset. The zero-config `parseMd5Mesh` costs both families by construction.
import { parseMd5MeshWithSectionHandlers, md5AllSectionHandlers } from '@flighthq/scene3d-formats';

export const result = parseMd5MeshWithSectionHandlers('MD5Version 10\n', undefined, md5AllSectionHandlers);
