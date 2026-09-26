import { getNodeChildren } from '@flighthq/node/contract';
import type { ImportDiagnostic, ObjMaterialHandler } from '@flighthq/types/contract';
import {
  BlinnPhongMaterialKind,
  OBJ_MATERIAL_BLINN_PHONG_FEATURE,
  StandardPbrMaterialKind,
} from '@flighthq/types/contract';

import { parseObjMaterialLibrary } from './mtlParse.ts';
import { objBlinnPhongMaterialHandler } from './objBlinnPhongMaterialHandler.ts';
import { createScene3DFromObj, parseObj } from './objDocument.ts';
import { objAllMaterialHandlers } from './objMaterialRegistry.ts';
import { objStandardPbrMaterialHandler } from './objStandardPbrMaterialHandler.ts';

// ★ OMITTING A HANDLER REMOVES ONE SHADING MODEL AND NOTHING ELSE. Each case drops a single handler and
// checks both halves: the model it owns stops resolving, AND the other model plus all the geometry are
// untouched. The second half is what makes these subtraction tests rather than "something changed" tests.
//
// The oracle for the refactor itself is objParse.test.ts, whose 92 cases exercise the full parser and passed
// unchanged when the hardcoded `hasObjPbrDirectives` ternary became a handler lookup. This file asserts the
// two things those cases cannot: that the default IS the family rather than a second path that agrees with
// it, and that naming a subset drops exactly one model.

describe('createScene3DFromObj', () => {
  it('assembles a live scene through the same family parseObj uses', () => {
    const scene = createScene3DFromObj(TRIANGLE, library());
    expect(scene).not.toBeNull();
    expect(getNodeChildren(scene.root).length).toBeGreaterThan(0);
  });

  it('forwards options to the parse it delegates to', () => {
    const scene = createScene3DFromObj(TRIANGLE, library(), [], { materialHandlers: [] });
    // Geometry still arrives; only the material resolution is given up, so the scene is smaller rather
    // than broken.
    expect(getNodeChildren(scene.root).length).toBeGreaterThan(0);
    expect(parseObj(TRIANGLE, library(), [], { materialHandlers: [] }).materials).toEqual([]);
  });

  it('builds a scene for any family, including an empty one, rather than throwing', () => {
    expect(createScene3DFromObj(TRIANGLE, library(), [], { materialHandlers: [] })).not.toBeNull();
  });
});

describe('parseObj', () => {
  it('parses identically with the default and with the full family named explicitly', () => {
    const fromDefault = parseObj(BOTH_MODELS, library());
    const fromExplicit = parseObj(BOTH_MODELS, library(), [], { materialHandlers: objAllMaterialHandlers });
    expect(JSON.stringify(fromExplicit)).toBe(JSON.stringify(fromDefault));
  });

  it('reads both shading models from the fixture, so the omission cases below subtract something real', () => {
    const kinds = parseObj(BOTH_MODELS, library()).materials.map((material) => material.kind);
    expect(kinds).toContain(BlinnPhongMaterialKind);
    expect(kinds).toContain(StandardPbrMaterialKind);
  });

  it('parses with NO handlers rather than failing, keeping the geometry and dropping the materials', () => {
    const document = parseObj(BOTH_MODELS, library(), [], { materialHandlers: [] });
    expect(document.materials).toEqual([]);
    expect(document.meshes.length).toBeGreaterThan(0);
    // Every subset reports "no material" rather than pointing at a row that is not there.
    for (const mesh of document.meshes) {
      for (const index of mesh.materials ?? []) expect(index).toBe(-1);
    }
  });

  it('resolves only Blinn-Phong when the StandardPbr handler is omitted', () => {
    const document = parseObj(BOTH_MODELS, library(), [], { materialHandlers: [objBlinnPhongMaterialHandler] });
    expect(document.materials.map((material) => material.kind)).toEqual([BlinnPhongMaterialKind]);
    expect(document.meshes.length).toBe(parseObj(BOTH_MODELS, library()).meshes.length);
  });

  it('resolves only StandardPbr when the Blinn-Phong handler is omitted', () => {
    const document = parseObj(BOTH_MODELS, library(), [], { materialHandlers: [objStandardPbrMaterialHandler] });
    expect(document.materials.map((material) => material.kind)).toEqual([StandardPbrMaterialKind]);
    expect(document.meshes.length).toBe(parseObj(BOTH_MODELS, library()).meshes.length);
  });

  // ORDER IS THE DISPATCH: the first handler whose `matches` returns true wins. These two handlers are
  // mutually exclusive on `hasObjPbrDirectives`, so reordering the standard family cannot change the
  // outcome — stated here so a future handler that overlaps is not assumed to be order-independent.
  it('gives the same result for either ordering of the standard family, which are mutually exclusive', () => {
    const forward = parseObj(BOTH_MODELS, library(), [], {
      materialHandlers: [objBlinnPhongMaterialHandler, objStandardPbrMaterialHandler],
    });
    const reversed = parseObj(BOTH_MODELS, library(), [], {
      materialHandlers: [objStandardPbrMaterialHandler, objBlinnPhongMaterialHandler],
    });
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
  });

  it('lets a caller override the standard dispatch by putting their own handler first', () => {
    const everything: Readonly<ObjMaterialHandler> = {
      // Claims the Blinn-Phong feature because that is what it resolves to; a handler's `feature` states
      // which model it reads, and this one reads every material as classic.
      feature: OBJ_MATERIAL_BLINN_PHONG_FEATURE,
      matches: () => true,
      resolve: (material, document, diagnostics) =>
        objBlinnPhongMaterialHandler.resolve(material, document, diagnostics),
    };
    const document = parseObj(BOTH_MODELS, library(), [], {
      materialHandlers: [everything, ...objAllMaterialHandlers],
    });
    // The PBR material is read by the override, so BOTH rows come back Blinn-Phong.
    expect(document.materials.map((material) => material.kind)).toEqual([
      BlinnPhongMaterialKind,
      BlinnPhongMaterialKind,
    ]);
  });

  it('keeps the guards regardless of the family, reporting a material the library never declared', () => {
    const diagnostics: ImportDiagnostic[] = [];
    parseObj('usemtl Missing\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n', library(), diagnostics, {
      materialHandlers: [],
    });
    expect(diagnostics.map((entry) => entry.kind)).toContain('obj.material-missing');
  });
});

const TRIANGLE = 'mtllib a.mtl\nusemtl Classic\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';

// One group per material so both models are resolved and each lands in the document's material table.
const BOTH_MODELS =
  'mtllib a.mtl\n' +
  'v 0 0 0\nv 1 0 0\nv 0 1 0\nv 1 1 0\n' +
  'g classic\nusemtl Classic\nf 1 2 3\n' +
  'g metal\nusemtl Metal\nf 2 4 3\n';

// `Kd` alone is the classic model; `Pr`/`Pm` are what `hasObjPbrDirectives` reads as metallic-roughness.
function library() {
  return parseObjMaterialLibrary('newmtl Classic\nKd 1 0 0\nnewmtl Metal\nKd 0 0 1\nPr 0.4\nPm 1\n');
}
