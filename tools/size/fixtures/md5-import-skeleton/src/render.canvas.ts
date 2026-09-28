// MD5 with the skeleton family only: joint nodes and the skin, no materials.
// ★ THE SELECTIVE ENTRY IS `parseMd5MeshWithSectionHandlers`, which reads with the handlers it is given and names no
// preset. The zero-config `parseMd5Mesh` costs both families by construction.
import { parseMd5MeshWithSectionHandlers, md5SkeletonFamily } from '@flighthq/scene3d-formats';

export const result = parseMd5MeshWithSectionHandlers('MD5Version 10\n', undefined, md5SkeletonFamily);
