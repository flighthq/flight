import { DisplayObjectKind, MorphShapeKind, ShapeKind } from '@flighthq/types/contract';

import * as domPackage from './contract';
import { domScene2DRenderPreset } from './scene2DDomPipeline';

describe('domScene2DRenderPreset', () => {
  it('binds every renderer this package exports, so none is unreachable through the preset', () => {
    const bound = new Set(domScene2DRenderPreset.nodeRenderers!.values());
    const exported = Object.entries(domPackage as Record<string, unknown>).filter(([name]) =>
      /^dom[A-Z]\w*Renderer$/u.test(name),
    );
    expect(exported.length).toBeGreaterThan(0);
    // Derived from the package's own exports, not a hand-list, so a renderer added without a binding
    // fails here rather than silently shipping as something no preset can reach.
    expect(exported.filter(([, renderer]) => !bound.has(renderer as never)).map(([name]) => name)).toEqual([]);
  });

  // The binding a naming rule could never predict, and the reason a build-time inventory cannot infer
  // DOM's table from renderer names: there is no `domDisplayObjectRenderer`.
  it('serves DisplayObject with the Scene2D renderer', () => {
    expect(domScene2DRenderPreset.nodeRenderers!.get(DisplayObjectKind)).toBe(domPackage.domScene2DRenderer);
  });

  // MorphShape owns a distinct kind while rendering the same retained command vocabulary, so the two
  // kinds share ONE renderer object rather than a second implementation. Asserted because a future
  // split would change what a catalog row for MorphShape must name.
  it('serves MorphShape and Shape with the same renderer object', () => {
    const renderers = domScene2DRenderPreset.nodeRenderers!;
    expect(renderers.get(MorphShapeKind)).toBe(renderers.get(ShapeKind));
  });

  it('omits the kinds DOM has no renderer for, rather than binding a stand-in that draws nothing', () => {
    for (const absent of ['BitmapText', 'ParticleEmitter2D', 'QuadBatch', 'Tilemap']) {
      expect(domScene2DRenderPreset.nodeRenderers!.has(absent as never), absent).toBe(false);
    }
  });
});
