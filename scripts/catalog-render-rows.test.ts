import { canvasScene2DRenderPreset } from '@flighthq/scene2d-canvas';
import { glScene2DRenderPreset } from '@flighthq/scene2d-gl';
import { wgpuScene2DRenderPreset } from '@flighthq/scene2d-wgpu';
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

  it('files every render row under scene.node-kind', () => {
    for (const row of buildRenderCatalogRows()) expect(row.facet).toBe(RequirementFacet.SceneNodeKind);
  });

  it('gives each backend-and-kind pair exactly one row', () => {
    const rows = buildRenderCatalogRows().map((row) => `${row.backend}|${row.kind}`);
    expect(rows.length).toBe(new Set(rows).size);
  });
});
