// The OBJ importer registering only the Blinn-Phong material handler. This is the case the
// decomposition exists to serve — classic MTL only, with no PBR handler linked and none of the
// StandardPbr material creation code behind it in the bundle.
//
// Uses parseObjWithMaterialHandlers directly to bypass the default family that parseObj resolves
// via objAllMaterialHandlers.
import { objBlinnPhongMaterialHandler, parseObjWithMaterialHandlers } from '@flighthq/scene3d-formats';

export const document = parseObjWithMaterialHandlers('', undefined, undefined, [objBlinnPhongMaterialHandler]);
