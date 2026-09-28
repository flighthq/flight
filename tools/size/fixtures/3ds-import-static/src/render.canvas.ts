// The same importer as 3ds-import, registering only the mesh and material handler families. This is
// the case the decomposition exists to serve — static geometry, with no camera, light, or keyframe
// handlers read and none of the packages behind them linked.
//
// Uses `buildThreeDsChunkDispatch` + `parseThreeDsDocumentWithDispatch` instead of `parse3ds`,
// because `parse3ds` has a default-family fallback that pulls in every handler via its import of
// `threeDsAllChunkHandlers`. The dispatch builder and the document parser have no such edge.
import {
  buildThreeDsChunkDispatch,
  parseThreeDsDocumentWithDispatch,
  threeDsMaterialFamily,
  threeDsMeshFamily,
} from '@flighthq/scene3d-formats';

export const document = parseThreeDsDocumentWithDispatch(
  new Uint8Array([0x4d, 0x4d]),
  undefined,
  buildThreeDsChunkDispatch([...threeDsMaterialFamily, ...threeDsMeshFamily]),
);
