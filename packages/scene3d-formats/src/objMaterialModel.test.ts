import type { ObjMaterial } from '@flighthq/types/contract';
import { OBJ_MATERIAL_BLINN_PHONG_FEATURE, OBJ_MATERIAL_STANDARD_PBR_FEATURE } from '@flighthq/types/contract';

import { parseObjMaterialLibrary } from './mtlParse.ts';
import { collectObjMaterialModels, hasObjPbrDirectives } from './objMaterialModel.ts';

describe('collectObjMaterialModels', () => {
  it('reports the classic model for a library stating only Ka/Kd/Ks/Ns', () => {
    expect([...collectObjMaterialModels('newmtl Red\nKd 1 0 0\nKs 1 1 1\nNs 30\n')]).toEqual([
      OBJ_MATERIAL_BLINN_PHONG_FEATURE,
    ]);
  });

  it('reports the PBR model for a library stating roughness or metallic', () => {
    expect([...collectObjMaterialModels('newmtl Metal\nKd 1 1 1\nPr 0.3\nPm 1\n')]).toEqual([
      OBJ_MATERIAL_STANDARD_PBR_FEATURE,
    ]);
  });

  // ★ BOTH, WHEN THE LIBRARY REALLY CONTAINS BOTH. MTL allows a shading model per material and the importer
  // dispatches per material, so a mixed library genuinely needs both handlers — this is the case that makes
  // "read the MTL" a superset-narrowing rather than an either/or choice.
  it('reports both models for a library that mixes them', () => {
    const models = collectObjMaterialModels('newmtl Red\nKd 1 0 0\nnewmtl Metal\nPr 0.3\n');
    expect([...models].sort()).toEqual([OBJ_MATERIAL_BLINN_PHONG_FEATURE, OBJ_MATERIAL_STANDARD_PBR_FEATURE].sort());
  });

  it('reports nothing for a library declaring no materials', () => {
    expect([...collectObjMaterialModels('# just a comment\n')]).toEqual([]);
  });

  // The emissive channel exists in both models, so it must not tip a classic material into PBR — the same
  // rule `hasObjPbrDirectives` states, reached through the library parse.
  it('does not read an emissive-bearing classic material as PBR', () => {
    expect([...collectObjMaterialModels('newmtl Glow\nKd 1 1 1\nKe 1 1 1\n')]).toEqual([
      OBJ_MATERIAL_BLINN_PHONG_FEATURE,
    ]);
  });
});

describe('hasObjPbrDirectives', () => {
  it('is false for a material stating only the classic directives', () => {
    expect(hasObjPbrDirectives(material('newmtl Red\nKd 1 0 0\nNs 10\n'))).toBe(false);
  });

  it.each(['Pr 0.5', 'Pm 1', 'Ps 0.4', 'Pc 0.2', 'aniso 0.3', 'map_Pr tex.png', 'map_Pm tex.png'])(
    'is true for a material stating %s',
    (directive) => {
      expect(hasObjPbrDirectives(material(`newmtl M\nKd 1 1 1\n${directive}\n`))).toBe(true);
    },
  );

  // Ke/map_Ke name a channel BOTH models carry, so they must not decide the model. Stated as its own case
  // because getting it wrong silently reinterprets every emissive classic material as PBR.
  it.each(['Ke 1 1 1', 'map_Ke tex.png'])(
    'is false for a material stating only %s beyond the classics',
    (directive) => {
      expect(hasObjPbrDirectives(material(`newmtl M\nKd 1 1 1\n${directive}\n`))).toBe(false);
    },
  );
});

function material(source: string): Readonly<ObjMaterial> {
  const library = parseObjMaterialLibrary(source);
  return [...library.materials.values()][0];
}
