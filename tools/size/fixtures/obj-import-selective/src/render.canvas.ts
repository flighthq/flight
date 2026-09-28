// The OBJ importer registering only the Blinn-Phong material handler. This is the case the
// decomposition exists to serve — classic MTL only, with no PBR handler linked and none of the
// StandardPbr material creation code behind it in the bundle.
//
// Uses parseObjWithMaterialHandlers directly to bypass the default family that parseObj resolves
// via objAllMaterialHandlers.
//
// The minimal OBJ carries one face referencing one material from a single-entry library. Without a
// library, `resolveObjMaterial` early-returns and the handler dispatch is unreachable — terser
// eliminates it entirely, making full and selective identical.
import { objBlinnPhongMaterialHandler, parseObjWithMaterialHandlers } from '@flighthq/scene3d-formats';
import type { ObjMaterialLibrary } from '@flighthq/types';

const OBJ_SOURCE = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl m\nf 1 2 3';

const MATERIALS: ObjMaterialLibrary = {
  materials: new Map([
    [
      'm',
      {
        ambient: [0, 0, 0] as const,
        anisotropy: null,
        anisotropyRotation: null,
        clearcoat: null,
        clearcoatRoughness: null,
        diffuse: [0.8, 0.8, 0.8] as const,
        dissolve: 1,
        emissive: null,
        illumination: 2,
        mapAmbient: null,
        mapBump: null,
        mapDiffuse: null,
        mapDissolve: null,
        mapEmissive: null,
        mapMetallic: null,
        mapNormal: null,
        mapRoughness: null,
        mapSpecular: null,
        metallic: null,
        name: 'm',
        roughness: null,
        sheen: null,
        specular: [0, 0, 0] as const,
        specularExponent: 0,
      },
    ],
  ]),
};

export const document = parseObjWithMaterialHandlers(OBJ_SOURCE, MATERIALS, undefined, [objBlinnPhongMaterialHandler]);
