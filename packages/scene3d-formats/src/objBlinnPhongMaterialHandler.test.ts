import type { ObjMaterial, Scene3DDocument } from '@flighthq/types/contract';
import { BlinnPhongMaterialKind } from '@flighthq/types/contract';

import { objBlinnPhongMaterialHandler, objMaterialToBlinnPhong } from './objBlinnPhongMaterialHandler.ts';

function emptyDocument(): Scene3DDocument {
  return { materials: [], meshes: [], nodes: [], resources: [], scenes: [{ rootNodes: [] }] };
}

function classicObjMaterial(): ObjMaterial {
  return {
    anisotropy: null,
    anisotropyRotation: null,
    clearcoat: null,
    clearcoatRoughness: null,
    diffuse: [0.8, 0.2, 0.1],
    dissolve: 1,
    emissive: null,
    mapBump: null,
    mapDiffuse: null,
    mapDissolve: null,
    mapEmissive: null,
    mapMetallic: null,
    mapNormal: null,
    mapRoughness: null,
    mapSheen: null,
    mapSpecular: null,
    metallic: null,
    name: 'classic',
    roughness: null,
    sheen: null,
    specular: [1, 1, 1],
    specularExponent: 100,
  };
}

describe('objBlinnPhongMaterialHandler', () => {
  it('is a handler object with feature, matches, and resolve', () => {
    expect(typeof objBlinnPhongMaterialHandler.matches).toBe('function');
    expect(typeof objBlinnPhongMaterialHandler.resolve).toBe('function');
    expect(objBlinnPhongMaterialHandler.feature).toBeDefined();
  });

  it('matches a classic MTL material without PBR directives', () => {
    expect(objBlinnPhongMaterialHandler.matches(classicObjMaterial())).toBe(true);
  });

  it('does not match a PBR material with roughness', () => {
    expect(objBlinnPhongMaterialHandler.matches({ ...classicObjMaterial(), roughness: 0.5 })).toBe(false);
  });
});

describe('objMaterialToBlinnPhong', () => {
  it('is a function', () => {
    expect(typeof objMaterialToBlinnPhong).toBe('function');
  });

  it('converts a classic MTL material to BlinnPhongMaterial', () => {
    const document = emptyDocument();
    const result = objMaterialToBlinnPhong(classicObjMaterial(), document, undefined);
    expect(result.kind).toBe(BlinnPhongMaterialKind);
  });

  it('sets blend alphaMode when dissolve is below 1', () => {
    const document = emptyDocument();
    const result = objMaterialToBlinnPhong({ ...classicObjMaterial(), dissolve: 0.5 }, document, undefined);
    expect(result.alphaMode).toBe('blend');
  });
});
