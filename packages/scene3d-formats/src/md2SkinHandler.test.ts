import type { Md2ParseContext, Scene3DDocument } from '@flighthq/types/contract';
import { BlinnPhongMaterialKind } from '@flighthq/types/contract';

import { MD2_SKIN_SIZE } from './md2Schema.ts';
import { md2SkinHandler } from './md2SkinHandler.ts';

describe('md2SkinHandler', () => {
  it('reads the Skin section', () => {
    expect(md2SkinHandler.section).toBe('Skin');
  });

  it('emits one BlinnPhong material per named skin, binding only the first to the mesh', () => {
    const context = contextFor(['body.pcx', 'alternate.pcx']);
    md2SkinHandler.collect(context);
    expect(context.document.materials.map((material) => material.kind)).toEqual([
      BlinnPhongMaterialKind,
      BlinnPhongMaterialKind,
    ]);
    // MD2's several skins are alternates for one mesh, so the rest stay available but unbound.
    expect(context.meshMaterials).toEqual([0]);
    expect(context.document.materials.map((material) => material.name)).toEqual(['body.pcx', 'alternate.pcx']);
  });

  it('registers each skin path as an external texture resource', () => {
    const context = contextFor(['body.pcx']);
    md2SkinHandler.collect(context);
    expect(context.document.resources.length).toBe(1);
  });

  // An empty skin record is counted by the header but names no texture. It is reported ONCE with a count
  // rather than per record, which is the aggregate-once contract the parser's other drops follow.
  it('reports empty skin paths once, with a count, and emits no material for them', () => {
    const context = contextFor(['', '', 'real.pcx']);
    md2SkinHandler.collect(context);
    expect(context.document.materials).toHaveLength(1);
    const crumbs = context.diagnostics!.filter((entry) => entry.kind === 'md2.skin-empty-path');
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0].detail).toEqual({ count: 2, firstSkin: 0 });
  });

  it('reports a truncated skin record rather than reading past the buffer', () => {
    const context = contextFor(['body.pcx']);
    const truncated: Md2ParseContext = { ...context, numSkins: 2 };
    md2SkinHandler.collect(truncated);
    expect(truncated.diagnostics!.map((entry) => entry.kind)).toContain('md2.skin-record-truncated');
  });
});

// Skin records are a run of fixed 64-byte NUL-terminated paths at `offSkins`; nothing else in the file is
// needed to exercise this handler, so the fixture is exactly that run.
function contextFor(skins: readonly string[]): Md2ParseContext {
  const bytes = new Uint8Array(skins.length * MD2_SKIN_SIZE);
  for (const [index, skin] of skins.entries()) {
    for (let i = 0; i < skin.length; i++) bytes[index * MD2_SKIN_SIZE + i] = skin.charCodeAt(i);
  }
  return {
    bytes,
    diagnostics: [],
    document: emptyDocument(),
    frames: [],
    meshMaterials: [],
    morph: null,
    numSkins: skins.length,
    offSkins: 0,
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
