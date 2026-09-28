// The OBJ importer with every material handler AND a material library that forces the handler
// dispatch path. Without a library, `resolveObjMaterial` early-returns and terser eliminates
// handler code entirely — this fixture proves the production shipping cost when material
// resolution is reachable.
import { parseObj } from '@flighthq/scene3d-formats';
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

export const document = parseObj(OBJ_SOURCE, MATERIALS);
