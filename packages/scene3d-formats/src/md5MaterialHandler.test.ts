import type { Md5ParseContext, Scene3DDocument } from '@flighthq/types/contract';
import { BlinnPhongMaterialKind, MD5_MATERIAL_FEATURE } from '@flighthq/types/contract';

import { md5MaterialHandler } from './md5MaterialHandler.ts';

describe('md5MaterialHandler', () => {
  it('claims the Material feature the analyzer emits for a shader-bearing mesh', () => {
    expect(md5MaterialHandler.feature).toBe(MD5_MATERIAL_FEATURE);
  });

  it('decodes the section shader as a BlinnPhong material and binds it to that mesh', () => {
    const context = contextFor('textures/default');
    md5MaterialHandler.collect(context);
    expect(context.document.materials.map((material) => material.kind)).toEqual([BlinnPhongMaterialKind]);
    expect(context.document.materials[0].name).toBe('textures/default');
    expect(context.mesh!.materials).toEqual([0]);
  });

  it('references the shader path as an external resource rather than loading it', () => {
    const context = contextFor('textures/default');
    md5MaterialHandler.collect(context);
    expect(context.document.resources).toHaveLength(1);
  });

  it('adds nothing for a section that names no shader', () => {
    const context = contextFor('');
    md5MaterialHandler.collect(context);
    expect(context.document.materials).toEqual([]);
    expect(context.mesh!.materials).toEqual([]);
  });

  // The parser only calls this handler at the per-mesh dispatch point, so `mesh` is never null there. The
  // guard is asserted anyway: a handler that indexed into null would fail only for a caller driving the
  // dispatch themselves, which is the case nothing else would cover.
  it('adds nothing at the file-level dispatch, where there is no mesh section', () => {
    const context = { ...contextFor('textures/default'), mesh: null };
    md5MaterialHandler.collect(context);
    expect(context.document.materials).toEqual([]);
  });

  it('gives each mesh section its own material, so two sections do not share one row', () => {
    const document = emptyDocument();
    const first = { materials: [] as number[], shader: 'a' };
    const second = { materials: [] as number[], shader: 'b' };
    for (const mesh of [first, second]) {
      md5MaterialHandler.collect({ ...contextFor(''), document, mesh });
    }
    expect(document.materials.map((material) => material.name)).toEqual(['a', 'b']);
    expect([first.materials, second.materials]).toEqual([[0], [1]]);
  });
});

function contextFor(shader: string): Md5ParseContext {
  return {
    diagnostics: [],
    document: emptyDocument(),
    drops: null,
    joints: [],
    mesh: { materials: [], shader },
    skin: null,
  };
}

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
