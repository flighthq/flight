import * as path from '@flighthq/path';
import * as renderGl from '@flighthq/render-gl';
// `applyCanvasBlendMode` and `standardGlBlendRealizations` are declared PROTECTED in each package's
// exports.yml, so they are reached on the contract lane. Asserting them through the public namespace
// made this file fail lint at base: the names are simply not there, which is the policy working.
import { standardGlBlendRealizations } from '@flighthq/render-gl/contract';
import * as renderWgpu from '@flighthq/render-wgpu';
import * as canvas from '@flighthq/scene2d-canvas';
import { canvasScene2DRenderPreset } from '@flighthq/scene2d-canvas';
import { applyCanvasBlendMode } from '@flighthq/scene2d-canvas/contract';
import * as dom from '@flighthq/scene2d-dom';
import * as scene2dGl from '@flighthq/scene2d-gl';
import { glScene2DRenderPreset } from '@flighthq/scene2d-gl';
import * as scene2dWgpu from '@flighthq/scene2d-wgpu';
import { wgpuScene2DRenderPreset } from '@flighthq/scene2d-wgpu';
import * as scene3dGl from '@flighthq/scene3d-gl';
import { glScene3DRenderPreset } from '@flighthq/scene3d-gl';
import * as scene3dWgpu from '@flighthq/scene3d-wgpu';
import { wgpuScene3DRenderPreset } from '@flighthq/scene3d-wgpu';
import { RequirementFacet } from '@flighthq/types/contract';

import { buildRenderCatalogRows, buildRequirementTranslations, PRESET_BACKENDS } from './catalog-render-rows';

describe('buildRequirementTranslations', () => {
  // ★ THE GUARD AGAINST UNACTIONABLE DIAGNOSTICS. A translation naming a kind no backend can render
  // puts a requirement in every build using that format which no catalog row could ever satisfy, so the
  // build warns forever about a gap in the SDK rather than in the document. That is the same failure
  // the SWF non-content tag filter exists to prevent, arriving from the other end of the pipeline. It
  // is not hypothetical: `MovieClip` was implied by every SWF and is bound by no 2D backend.
  it('implies only kinds some backend can actually render', () => {
    const bound = new Set<string>();
    for (const preset of [canvasScene2DRenderPreset, glScene2DRenderPreset, wgpuScene2DRenderPreset]) {
      for (const kind of preset.nodeRenderers.keys()) bound.add(String(kind));
    }
    const implied = new Set(buildRequirementTranslations().flatMap((t) => t.to.map((r) => String(r.key))));
    expect(implied.size).toBeGreaterThan(0);
    expect([...implied].filter((kind) => !bound.has(kind))).toEqual([]);
  });

  it('translates format requirements into scene node kinds, not back into format keys', () => {
    for (const translation of buildRequirementTranslations()) {
      expect(translation.from.facet).toBe(RequirementFacet.DocumentFormat);
      expect(translation.to.length).toBeGreaterThan(0);
      for (const requirement of translation.to) expect(requirement.facet).toBe(RequirementFacet.SceneNodeKind);
    }
  });

  // The namespace-keyed row is what covers a document whose tags build no nodes at all. Without it a
  // SWF containing only SetBackgroundColor would resolve no renderer for its own root.
  it('carries a format-wide row keyed on the bare namespace', () => {
    const bare = buildRequirementTranslations().filter((t) => !t.from.key.includes('.'));
    expect(bare.map((t) => t.from.key)).toEqual(['swf']);
    expect(bare[0]!.to.length).toBeGreaterThan(0);
  });
});

describe('buildRenderCatalogRows', () => {
  it('names only renderers the backend module actually exports, matched by identity', () => {
    for (const backend of PRESET_BACKENDS) {
      for (const renderer of backend.renderers.values()) {
        expect(backend.symbols.get(renderer), `${backend.name} has an unexported renderer`).toBeDefined();
      }
    }
  });

  it('covers every backend that ships a preset, plus dom', () => {
    const backends = new Set(buildRenderCatalogRows().map((row) => row.backend));
    expect([...backends].sort()).toEqual(['canvas', 'dom', 'gl', 'wgpu']);
  });

  it('files rows under the expected render facets', () => {
    const facets = new Set(buildRenderCatalogRows().map((row) => row.facet));
    expect(facets).toContain(RequirementFacet.SceneNodeKind);
    expect(facets).toContain(RequirementFacet.SceneShapeCommand);
    expect(facets).toContain(RequirementFacet.SceneBlendMode);
  });

  it('gives each backend-and-kind pair exactly one row', () => {
    const rows = buildRenderCatalogRows().map((row) => `${row.backend}|${row.kind}`);
    expect(rows.length).toBe(new Set(rows).size);
  });
});

describe('render preset public composition tier', () => {
  // This is intentionally a ONE-LEVEL identity check. The maps, slots, and aggregate standard tables
  // used to compose a preset are public; methods inside a renderer, resolver callbacks inside a standard
  // table, blend-realization fields, and skinning-adapter methods remain contract implementation.
  it('publishes every Canvas and DOM preset component', () => {
    expect(canvasScene2DRenderPreset.blendModeApplication).toBe(applyCanvasBlendMode);
    expectMapEntriesToMatch(canvasScene2DRenderPreset.canvasShapeCommands!, canvas.canvasShapeCommandTable());
    expectMapValuesToBePublic(canvasScene2DRenderPreset.nodeRenderers, 'canvas node renderer', canvas);
    expectMapValuesToBePublic(dom.domScene2DRenderPreset.nodeRenderers!, 'dom node renderer', dom);
    expect('applyCanvasMaterial' in canvas).toBe(false);
    expect('applyDomBlendMode' in dom).toBe(false);
  });

  it('publishes every GL preset component', () => {
    expect(glScene2DRenderPreset.blendRealizations).toBe(standardGlBlendRealizations);
    expect(glScene2DRenderPreset.strokeTessellator).toBe(path.tessellateStrokePath);
    expect(glScene2DRenderPreset.textureResolvers).toBe(renderGl.standardGlTextureResolvers);
    expectMapValuesToBePublic(glScene2DRenderPreset.materialRenderers, 'GL 2D material renderer', scene2dGl);
    expectMapValuesToBePublic(glScene2DRenderPreset.nodeRenderers, 'GL 2D node renderer', scene2dGl);
    expectMapValuesToBePublic(glScene3DRenderPreset.materialRenderers, 'GL 3D material renderer', scene2dGl, scene3dGl);
    expectMapValuesToBePublic(glScene3DRenderPreset.modifierSnippets, 'GL modifier snippet', scene3dGl);
    expectMapValuesToBePublic(glScene3DRenderPreset.pbrExtensions, 'GL PBR extension', scene3dGl);
    expect('applyGlBlendMode' in renderGl).toBe(false);
    expect('resolveGlBitmapTexture' in renderGl).toBe(false);
    expect('bindGlPbrExtensions' in scene3dGl).toBe(false);
  });

  it('publishes every WebGPU preset component', () => {
    expectMapValuesToBePublic(wgpuScene2DRenderPreset.materialRenderers, 'WebGPU 2D material renderer', scene2dWgpu);
    expectMapValuesToBePublic(wgpuScene2DRenderPreset.nodeRenderers, 'WebGPU 2D node renderer', scene2dWgpu);
    expect(wgpuScene3DRenderPreset.gpuSkinning).toBe(scene3dWgpu.wgpuSkinningAdapter);
    expectMapValuesToBePublic(
      wgpuScene3DRenderPreset.materialRenderers,
      'WebGPU 3D material renderer',
      scene2dWgpu,
      scene3dWgpu,
    );
    expectMapValuesToBePublic(wgpuScene3DRenderPreset.modifierSnippets, 'WebGPU modifier snippet', scene3dWgpu);
    expectMapEntriesToMatch(wgpuScene3DRenderPreset.textureResolvers, renderWgpu.standardWgpuTextureResolvers);
    expect('bindWgpuClassicSurface' in scene3dWgpu).toBe(false);
    expect('ensureWgpuSkinDrawLayout' in scene3dWgpu).toBe(false);
    expect('uploadWgpuSkinPalette' in scene3dWgpu).toBe(false);
    expect('bindWgpuTexture' in renderWgpu).toBe(false);
    expect('resolveWgpuBitmapTexture' in renderWgpu).toBe(false);
  });
});

function expectMapEntriesToMatch(actual: ReadonlyMap<unknown, unknown>, expected: ReadonlyMap<unknown, unknown>): void {
  for (const [key, value] of expected) expect(actual.get(key), String(key)).toBe(value);
}

function expectMapValuesToBePublic(
  table: ReadonlyMap<unknown, unknown>,
  label: string,
  ...modules: readonly object[]
): void {
  const publicValues = new Set(modules.flatMap((module) => Object.values(module)));
  for (const [key, value] of table) expect(publicValues.has(value), `${label} ${String(key)}`).toBe(true);
}
