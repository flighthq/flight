import type { ObjMaterial, Scene3DDocument } from '@flighthq/types/contract';
import { StandardPbrMaterialKind } from '@flighthq/types/contract';

import { objMaterialToStandardPbr, objStandardPbrMaterialHandler } from './objStandardPbrMaterialHandler.ts';

function emptyDocument(): Scene3DDocument {
  return {
    animations: [],
    cameras: [],
    lights: [],
    materials: [],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [{ rootNodes: [] }],
    skins: [],
  };
}

function pbrObjMaterial(): ObjMaterial {
  return {
    ambient: [0, 0, 0],
    anisotropy: null,
    anisotropyRotation: null,
    clearcoat: null,
    clearcoatRoughness: null,
    diffuse: [0.8, 0.2, 0.1],
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
    name: 'pbr',
    roughness: 0.5,
    sheen: null,
    specular: [1, 1, 1],
    specularExponent: 100,
  };
}

describe('objMaterialToStandardPbr', () => {
  it('is a function', () => {
    expect(typeof objMaterialToStandardPbr).toBe('function');
  });

  it('converts a PBR MTL material to StandardPbrMaterial', () => {
    const document = emptyDocument();
    const result = objMaterialToStandardPbr(pbrObjMaterial(), document, undefined);
    expect(result.kind).toBe(StandardPbrMaterialKind);
  });

  it('sets blend alphaMode when dissolve is below 1', () => {
    const document = emptyDocument();
    const result = objMaterialToStandardPbr({ ...pbrObjMaterial(), dissolve: 0.5 }, document, undefined);
    expect(result.alphaMode).toBe('blend');
  });
});

describe('objStandardPbrMaterialHandler', () => {
  it('is a handler object with feature, matches, and resolve', () => {
    expect(typeof objStandardPbrMaterialHandler.matches).toBe('function');
    expect(typeof objStandardPbrMaterialHandler.resolve).toBe('function');
    expect(objStandardPbrMaterialHandler.feature).toBeDefined();
  });

  it('matches a PBR material with roughness', () => {
    expect(objStandardPbrMaterialHandler.matches(pbrObjMaterial())).toBe(true);
  });

  it('does not match a classic MTL material', () => {
    expect(objStandardPbrMaterialHandler.matches({ ...pbrObjMaterial(), roughness: null })).toBe(false);
  });
});
