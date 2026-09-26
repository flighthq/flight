import { getNodeChildren } from '@flighthq/node/contract';
import type { ImportDiagnostic } from '@flighthq/types/contract';
import { BlinnPhongMaterialKind } from '@flighthq/types/contract';

import { createScene3DFromMd5Mesh, importMd5Mesh, parseMd5Mesh } from './md5Document.ts';
import { md5MaterialHandler } from './md5MaterialHandler.ts';
import { md5AllSectionHandlers } from './md5SectionRegistry.ts';
import { md5SkeletonHandler } from './md5SkeletonHandler.ts';

// ★ OMITTING A HANDLER REMOVES ONE FEATURE AND NOTHING ELSE. Each case drops a single handler and checks
// both halves: the feature it owns disappears, AND the geometry plus the other feature are untouched.
//
// The oracle for the refactor is md5Parse.test.ts, whose 61 cases exercise the full parser and passed
// unchanged when the skeleton emission and the per-section shader became handlers.

describe('createScene3DFromMd5Mesh', () => {
  it('assembles a live scene through the same family parseMd5Mesh uses', () => {
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    expect(getNodeChildren(scene.root).length).toBeGreaterThan(0);
  });

  it('forwards options to the parse it delegates to', () => {
    expect(parseMd5Mesh(SINGLE_TRIANGLE, [], { sectionHandlers: [] }).materials).toEqual([]);
    expect(parseMd5Mesh(SINGLE_TRIANGLE).materials).toHaveLength(1);
  });
});

describe('importMd5Mesh', () => {
  it('forwards options through the composer to the mesh parse', () => {
    const scene = importMd5Mesh(SINGLE_TRIANGLE, null, [], { sectionHandlers: [md5SkeletonHandler] });
    expect(getNodeChildren(scene.root).length).toBeGreaterThan(0);
  });

  // ★ OMITTING THE SKELETON HANDLER REACHES THIS COMPOSER. A caller who drops the skeleton to save the joint
  // nodes and then pairs an .md5anim has no skeleton for its channels to bind to — the same state a jointless
  // file produces, and it must be reported the same way rather than silently losing the animation.
  it('reports a paired animation it cannot bind when the skeleton handler was omitted', () => {
    const diagnostics: ImportDiagnostic[] = [];
    importMd5Mesh(SINGLE_TRIANGLE, SINGLE_FRAME_ANIM, diagnostics, { sectionHandlers: [md5MaterialHandler] });
    expect(diagnostics.map((entry) => entry.kind)).toContain('md5mesh.animation-no-skeleton');
  });

  it('binds a paired animation when the skeleton is present', () => {
    const scene = importMd5Mesh(SINGLE_TRIANGLE, SINGLE_FRAME_ANIM, []);
    expect(Object.keys(scene.animations)).toEqual(['default']);
  });
});

describe('parseMd5Mesh', () => {
  it('parses identically with the default and with the full family named explicitly', () => {
    const fromDefault = parseMd5Mesh(SINGLE_TRIANGLE);
    const fromExplicit = parseMd5Mesh(SINGLE_TRIANGLE, [], { sectionHandlers: md5AllSectionHandlers });
    expect(JSON.stringify(fromExplicit)).toBe(JSON.stringify(fromDefault));
  });

  it('reads both features of the fixture, so the omission cases below subtract something real', () => {
    const document = parseMd5Mesh(SINGLE_TRIANGLE);
    expect(document.materials.map((material) => material.kind)).toEqual([BlinnPhongMaterialKind]);
    expect(document.skins).toHaveLength(1);
    expect(document.meshes).toHaveLength(1);
  });

  it('keeps the geometry with NO handlers, dropping only the material and the skeleton', () => {
    const document = parseMd5Mesh(SINGLE_TRIANGLE, [], { sectionHandlers: [] });
    expect(document.meshes).toHaveLength(1);
    expect(document.materials).toEqual([]);
    expect(document.skins).toEqual([]);
    // With no skin emitted, the mesh binds none — the same shape a jointless file already produced.
    expect(document.meshes[0].skin).toBeUndefined();
  });

  it('omitting the material handler removes the material and nothing else', () => {
    const full = parseMd5Mesh(SINGLE_TRIANGLE);
    const partial = parseMd5Mesh(SINGLE_TRIANGLE, [], { sectionHandlers: [md5SkeletonHandler] });
    expect(partial.materials).toEqual([]);
    expect(partial.resources).toEqual([]);
    expect(JSON.stringify(partial.skins)).toBe(JSON.stringify(full.skins));
    expect(JSON.stringify(partial.meshes[0].geometry)).toBe(JSON.stringify(full.meshes[0].geometry));
  });

  it('omitting the skeleton handler removes the joint nodes and skin, keeping the material', () => {
    const full = parseMd5Mesh(SINGLE_TRIANGLE);
    const partial = parseMd5Mesh(SINGLE_TRIANGLE, [], { sectionHandlers: [md5MaterialHandler] });
    expect(partial.skins).toEqual([]);
    expect(JSON.stringify(partial.materials)).toBe(JSON.stringify(full.materials));
    // The skeleton group plus its joint node are what go missing, so only the mesh node remains.
    expect(partial.nodes).toHaveLength(full.nodes.length - 2);
  });

  it('keeps the read-integrity guards regardless of the family', () => {
    for (const sectionHandlers of [undefined, md5AllSectionHandlers, []]) {
      const diagnostics: ImportDiagnostic[] = [];
      parseMd5Mesh('not an md5 file', diagnostics, { sectionHandlers });
      expect(diagnostics.map((entry) => entry.kind)).toContain('md5mesh.no-data');
    }
  });
});

// A single joint at the origin and one triangle whose three vertices each reference one weight, with a
// shader — the smallest file carrying BOTH optional features.
const SINGLE_TRIANGLE = [
  'MD5Version 10',
  'commandline ""',
  '',
  'numJoints 1',
  'numMeshes 1',
  '',
  'joints {',
  '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
  '}',
  '',
  'mesh {',
  '  shader "textures/default"',
  '',
  '  numverts 3',
  '  vert 0 ( 0.0 0.0 ) 0 1',
  '  vert 1 ( 1.0 0.0 ) 1 1',
  '  vert 2 ( 0.0 1.0 ) 2 1',
  '',
  '  numtris 1',
  '  tri 0 0 1 2',
  '',
  '  numweights 3',
  '  weight 0 0 1.0 ( 0 0 0 )',
  '  weight 1 0 1.0 ( 1 0 0 )',
  '  weight 2 0 1.0 ( 0 1 0 )',
  '}',
].join('\n');

const SINGLE_FRAME_ANIM = [
  'MD5Version 10',
  'commandline ""',
  '',
  'numFrames 1',
  'numJoints 1',
  'frameRate 24',
  'numAnimatedComponents 6',
  '',
  'hierarchy {',
  '  "root" -1 63 0',
  '}',
  '',
  'bounds {',
  '  ( 0 0 0 ) ( 1 1 1 )',
  '}',
  '',
  'baseframe {',
  '  ( 0 0 0 ) ( 0 0 0 )',
  '}',
  '',
  'frame 0 {',
  '  0 0 0 0 0 0',
  '}',
].join('\n');
