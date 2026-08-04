import { RenderRegistry } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { findUndrawnRegistryMisses, formatUndrawnRegistryMisses } from './captureRegistryMiss.js';

// A verbatim line from a captured page, so the shape this parses is the shape the guards actually emit
// rather than one invented to match the parser.
//
// `registry` is the one field NOT kept as the captured literal. RenderRegistry takes its values from
// declaration order and nothing persists them, so the captured `2` meant NodeRenderer only against the
// enum as it stood that day; inserting an alphabetically earlier member silently repoints the literal at
// a different registry — which is exactly what happened, moving NodeRenderer to 5 and making 2
// MaterialRenderer, so this fixture started asserting that a material-renderer miss is ignored. Name the
// member. The captured shape is what this test is about; the ordinal never was.
const OBSERVED_NODE_RENDERER_MISS = {
  __flight: true,
  t: 176,
  level: 'warn',
  channel: 'render',
  data: {
    kind: 'DisplayObject',
    message: 'createRenderProxy: node kind has no registered renderer — call registerRenderer(state, kind, renderer)',
    registry: RenderRegistry.NodeRenderer,
  },
};

function miss(kind: string, registry: RenderRegistry) {
  return { __flight: true, level: 'warn', channel: 'render', data: { kind, message: '…', registry } };
}

describe('findUndrawnRegistryMisses', () => {
  it('finds a shape rasterizer miss', () => {
    // The regression this gate exists for: a shape whose fill has no tessellated form, with no
    // rasterizer registered, draws nothing while the run stays green.
    expect(findUndrawnRegistryMisses([miss('Shape', RenderRegistry.ShapeRasterizer)])).toEqual([
      { kind: 'Shape', registry: RenderRegistry.ShapeRasterizer },
    ]);
  });

  it('finds a material renderer miss', () => {
    expect(findUndrawnRegistryMisses([miss('Standard', RenderRegistry.MaterialRenderer)])).toEqual([
      { kind: 'Standard', registry: RenderRegistry.MaterialRenderer },
    ]);
  });

  it('ignores a node renderer miss, which every passing target reports', () => {
    // Load-bearing: a container has no visual of its own, so every example logs this for DisplayObject.
    // Gating on it would fail the whole suite, which is why the filter is the safety of this gate.
    expect(findUndrawnRegistryMisses([OBSERVED_NODE_RENDERER_MISS])).toEqual([]);
  });

  it('ignores the registries whose absence does not mean undrawn output', () => {
    expect(
      findUndrawnRegistryMisses([
        miss('Blur', RenderRegistry.EffectPaddingResolver),
        miss('roundRect', RenderRegistry.ShapeCommandHandler),
        miss('Image', RenderRegistry.TextureResolver),
      ]),
    ).toEqual([]);
  });

  it('reports one defect once when a target drives more than one state', () => {
    const logs = [miss('Shape', RenderRegistry.ShapeRasterizer), miss('Shape', RenderRegistry.ShapeRasterizer)];
    expect(findUndrawnRegistryMisses(logs)).toHaveLength(1);
  });

  it('keeps distinct kinds and distinct registries apart', () => {
    const logs = [
      miss('Shape', RenderRegistry.ShapeRasterizer),
      miss('MorphShape', RenderRegistry.ShapeRasterizer),
      miss('Shape', RenderRegistry.MaterialRenderer),
    ];
    expect(findUndrawnRegistryMisses(logs)).toHaveLength(3);
  });

  it('ignores entries that are not registry misses', () => {
    // Console lines, page errors, and screenshots share the log stream; none carry a numeric registry.
    expect(
      findUndrawnRegistryMisses([
        { level: 'error', data: { msg: 'boom' } },
        { level: 'warn', channel: 'console', data: { msg: '[render] {kind: Shape, registry: 4}' } },
        { level: 'warn', data: { kind: 'Shape', registry: 'ShapeRasterizer' } },
        {},
        null,
      ]),
    ).toEqual([]);
  });
});

describe('formatUndrawnRegistryMisses', () => {
  it('names the registry rather than printing its numeric enum value', () => {
    const message = formatUndrawnRegistryMisses([{ kind: 'Shape', registry: RenderRegistry.ShapeRasterizer }]);
    expect(message).toContain('no shape rasterizer');
    expect(message).toContain('Shape');
    expect(message).not.toContain('4');
  });

  it('lists every miss so one run reports every undrawn kind', () => {
    const message = formatUndrawnRegistryMisses([
      { kind: 'Shape', registry: RenderRegistry.ShapeRasterizer },
      { kind: 'Standard', registry: RenderRegistry.MaterialRenderer },
    ]);
    expect(message).toContain('Shape');
    expect(message).toContain('Standard');
  });
});
