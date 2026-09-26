import { getNodeChildren } from '@flighthq/node/contract';
import type { ImportDiagnostic } from '@flighthq/types/contract';
import { BlinnPhongMaterialKind } from '@flighthq/types/contract';

import { md2AnimationHandler } from './md2AnimationHandler.ts';
import { createScene3DFromMd2, parseMd2 } from './md2Document.ts';
import {
  MD2_COMPRESSED_VERTEX_SIZE,
  MD2_FRAME_HEADER_SIZE,
  MD2_HEADER_SIZE,
  MD2_MAGIC,
  MD2_SKIN_SIZE,
  MD2_TEXCOORD_SIZE,
  MD2_TRIANGLE_SIZE,
  MD2_VERSION,
} from './md2Schema.ts';
import { md2AllSectionHandlers } from './md2SectionRegistry.ts';
import { md2SkinHandler } from './md2SkinHandler.ts';

// ★ OMITTING A HANDLER REMOVES ONE SECTION AND NOTHING ELSE. Each case drops a single handler and checks
// both halves: the section it owns disappears, AND the geometry plus the other section are untouched. The
// second half is what makes these subtraction tests rather than "something changed" tests.
//
// The oracle for the refactor is md2Parse.test.ts, whose 47 cases exercise the full parser and passed
// unchanged when the skin and frame sections became handlers. This file asserts what those cannot: that the
// default IS the family rather than a second path agreeing with it, and that a subset drops exactly one
// section.

describe('createScene3DFromMd2', () => {
  it('assembles a live scene through the same family parseMd2 uses', () => {
    const scene = createScene3DFromMd2(animatedSkinnedMd2());
    expect(getNodeChildren(scene.root).length).toBeGreaterThan(0);
  });

  it('forwards options to the parse it delegates to', () => {
    expect(parseMd2(animatedSkinnedMd2(), [], { sectionHandlers: [] }).materials).toEqual([]);
    expect(parseMd2(animatedSkinnedMd2()).materials.length).toBeGreaterThan(0);
  });

  it('builds a scene for any family, including an empty one, rather than throwing', () => {
    const scene = createScene3DFromMd2(animatedSkinnedMd2(), [], { sectionHandlers: [] });
    expect(getNodeChildren(scene.root).length).toBeGreaterThan(0);
  });
});

describe('parseMd2', () => {
  it('parses identically with the default and with the full family named explicitly', () => {
    const fromDefault = parseMd2(animatedSkinnedMd2());
    const fromExplicit = parseMd2(animatedSkinnedMd2(), [], { sectionHandlers: md2AllSectionHandlers });
    expect(JSON.stringify(fromExplicit)).toBe(JSON.stringify(fromDefault));
  });

  it('reads both sections of the fixture, so the omission cases below subtract something real', () => {
    const document = parseMd2(animatedSkinnedMd2());
    expect(document.materials.map((material) => material.kind)).toEqual([BlinnPhongMaterialKind]);
    expect(document.animations.length).toBeGreaterThan(0);
    expect(document.meshes).toHaveLength(1);
  });

  // ★ THE GEOMETRY IS NOT OPTIONAL, AND THIS IS WHERE THAT SHOWS. With no handlers at all the model still
  // arrives — mesh, vertices, morph substrate and node — because the header, triangles, texcoords and frame
  // 0 are what make it a model. Only the two sections a build can do without are gone.
  it('keeps the geometry with NO handlers, dropping only the materials and the animation', () => {
    const document = parseMd2(animatedSkinnedMd2(), [], { sectionHandlers: [] });
    expect(document.meshes).toHaveLength(1);
    expect(document.nodes).toHaveLength(1);
    expect(document.materials).toEqual([]);
    expect(document.animations).toEqual([]);
    // The morph substrate is geometry, so it survives; what is gone is the clip that would play it.
    expect(document.meshes[0].morph).not.toBeUndefined();
  });

  it('omitting the skin handler removes the materials and nothing else', () => {
    const full = parseMd2(animatedSkinnedMd2());
    const partial = parseMd2(animatedSkinnedMd2(), [], { sectionHandlers: [md2AnimationHandler] });
    expect(partial.materials).toEqual([]);
    expect(partial.resources).toEqual([]);
    expect(JSON.stringify(partial.animations)).toBe(JSON.stringify(full.animations));
    expect(JSON.stringify(partial.meshes[0].geometry)).toBe(JSON.stringify(full.meshes[0].geometry));
  });

  it('omitting the animation handler yields a static pose and nothing else changes', () => {
    const full = parseMd2(animatedSkinnedMd2());
    const partial = parseMd2(animatedSkinnedMd2(), [], { sectionHandlers: [md2SkinHandler] });
    expect(partial.animations).toEqual([]);
    expect(JSON.stringify(partial.materials)).toBe(JSON.stringify(full.materials));
    expect(JSON.stringify(partial.meshes)).toBe(JSON.stringify(full.meshes));
  });

  it('keeps the read-integrity guards regardless of the family', () => {
    for (const sectionHandlers of [undefined, md2AllSectionHandlers, []]) {
      const diagnostics: ImportDiagnostic[] = [];
      const document = parseMd2(new Uint8Array([1, 2, 3]), diagnostics, { sectionHandlers });
      expect(document.meshes).toEqual([]);
      expect(diagnostics.map((entry) => entry.kind)).toContain('md2.header-too-short');
    }
  });
});

// A two-frame, one-skin, one-triangle MD2 — the smallest file that carries BOTH optional sections, so
// every omission case above has something real to remove.
function animatedSkinnedMd2(): Uint8Array {
  const skins = ['body.pcx'];
  const numVertices = 3;
  const numFrames = 2;
  const frameStride = MD2_FRAME_HEADER_SIZE + numVertices * MD2_COMPRESSED_VERTEX_SIZE;

  const offSkins = MD2_HEADER_SIZE;
  const offTexCoords = offSkins + skins.length * MD2_SKIN_SIZE;
  const offTriangles = offTexCoords + MD2_TEXCOORD_SIZE;
  const offFrames = offTriangles + MD2_TRIANGLE_SIZE;
  const total = offFrames + numFrames * frameStride;

  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, MD2_MAGIC, true);
  view.setInt32(4, MD2_VERSION, true);
  view.setInt32(8, 64, true); // skin width
  view.setInt32(12, 64, true); // skin height
  view.setInt32(16, frameStride, true);
  view.setInt32(20, skins.length, true);
  view.setInt32(24, numVertices, true);
  view.setInt32(28, 1, true); // numTexCoords
  view.setInt32(32, 1, true); // numTriangles
  view.setInt32(40, numFrames, true);
  view.setInt32(44, offSkins, true);
  view.setInt32(48, offTexCoords, true);
  view.setInt32(52, offTriangles, true);
  view.setInt32(56, offFrames, true);
  view.setInt32(64, total, true);

  for (const [index, skin] of skins.entries()) {
    for (let i = 0; i < skin.length; i++) bytes[offSkins + index * MD2_SKIN_SIZE + i] = skin.charCodeAt(i);
  }

  // One triangle over the three vertices, all sharing texcoord 0.
  for (let corner = 0; corner < 3; corner++) {
    view.setUint16(offTriangles + corner * 2, corner, true);
    view.setUint16(offTriangles + 6 + corner * 2, 0, true);
  }

  // Frame names are what segment the clips, so both frames name the same action: one clip, two keyframes.
  for (let f = 0; f < numFrames; f++) {
    const base = offFrames + f * frameStride;
    for (let axis = 0; axis < 3; axis++) {
      view.setFloat32(base + axis * 4, 1, true); // scale
      view.setFloat32(base + 12 + axis * 4, 0, true); // translate
    }
    const name = `stand0${f + 1}`;
    for (let i = 0; i < name.length; i++) bytes[base + 24 + i] = name.charCodeAt(i);
    // Frame 1 displaces the vertices so the morph targets are non-degenerate.
    for (let v = 0; v < numVertices; v++) {
      const vertex = base + MD2_FRAME_HEADER_SIZE + v * MD2_COMPRESSED_VERTEX_SIZE;
      bytes[vertex] = v * 10 + f;
      bytes[vertex + 1] = v * 5;
      bytes[vertex + 2] = 0;
      bytes[vertex + 3] = 0; // normal index
    }
  }
  return bytes;
}
