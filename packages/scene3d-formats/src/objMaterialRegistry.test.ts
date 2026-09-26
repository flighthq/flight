import type { ObjMaterial } from '@flighthq/types/contract';

import { objBlinnPhongMaterialHandler } from './objBlinnPhongMaterialHandler.ts';
import {
  objAllMaterialHandlers,
  objBlinnPhongMaterialFamily,
  objStandardPbrMaterialFamily,
} from './objMaterialRegistry.ts';
import { objStandardPbrMaterialHandler } from './objStandardPbrMaterialHandler.ts';

describe('objAllMaterialHandlers', () => {
  it('contains both handler families', () => {
    expect(objAllMaterialHandlers).toContain(objBlinnPhongMaterialHandler);
    expect(objAllMaterialHandlers).toContain(objStandardPbrMaterialHandler);
  });
});

describe('objBlinnPhongMaterialFamily', () => {
  it('contains the BlinnPhong handler', () => {
    expect(objBlinnPhongMaterialFamily).toContain(objBlinnPhongMaterialHandler);
    expect(objBlinnPhongMaterialFamily.length).toBe(1);
  });
});

describe('objBlinnPhongMaterialHandler', () => {
  it('matches a classic MTL material with no PBR directives', () => {
    expect(objBlinnPhongMaterialHandler.matches(classicMaterial())).toBe(true);
  });

  it('does not match a material with PBR directives', () => {
    expect(objBlinnPhongMaterialHandler.matches(pbrMaterial())).toBe(false);
  });
});

describe('objStandardPbrMaterialFamily', () => {
  it('contains the StandardPbr handler', () => {
    expect(objStandardPbrMaterialFamily).toContain(objStandardPbrMaterialHandler);
    expect(objStandardPbrMaterialFamily.length).toBe(1);
  });
});

describe('objStandardPbrMaterialHandler', () => {
  it('matches a material with PBR directives', () => {
    expect(objStandardPbrMaterialHandler.matches(pbrMaterial())).toBe(true);
  });

  it('does not match a classic MTL material', () => {
    expect(objStandardPbrMaterialHandler.matches(classicMaterial())).toBe(false);
  });

  it('matches when only roughness is present', () => {
    const mat = classicMaterial();
    mat.roughness = 0.5;
    expect(objStandardPbrMaterialHandler.matches(mat)).toBe(true);
  });

  it('matches when only metallic is present', () => {
    const mat = classicMaterial();
    mat.metallic = 1.0;
    expect(objStandardPbrMaterialHandler.matches(mat)).toBe(true);
  });
});

function classicMaterial(): ObjMaterial {
  return {
    ambient: [0, 0, 0],
    anisotropy: null,
    anisotropyRotation: null,
    clearcoat: null,
    clearcoatRoughness: null,
    diffuse: [0.8, 0.8, 0.8],
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
    name: 'classic',
    roughness: null,
    sheen: null,
    specular: [0, 0, 0],
    specularExponent: 0,
  };
}

function pbrMaterial(): ObjMaterial {
  return {
    ...classicMaterial(),
    metallic: 0.0,
    name: 'pbr',
    roughness: 0.5,
  };
}
