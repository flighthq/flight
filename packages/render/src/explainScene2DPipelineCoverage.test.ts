import { addNodeChild } from '@flighthq/node/contract';
import { createDisplayObject, createSprite } from '@flighthq/scene2d/contract';
import type { NodeRenderer } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { explainScene2DPipelineCoverage } from './explainScene2DPipelineCoverage.ts';
import { registerNodeRenderer } from './renderer.ts';
import { createRenderState } from './renderState.ts';

const renderer: NodeRenderer = { createData: () => null, submit: () => {} } as unknown as NodeRenderer;

describe('explainScene2DPipelineCoverage', () => {
  it('reports unused registrations when the pipeline covers more kinds than the scene uses', () => {
    const state = createRenderState();
    registerNodeRenderer(state, 'Sprite', renderer);
    registerNodeRenderer(state, 'DisplayObject', renderer);
    const root = createSprite();
    const result = explainScene2DPipelineCoverage(state, root);
    expect(result.usedKinds).toEqual(['Sprite']);
    expect(result.registeredKinds).toContain('DisplayObject');
    expect(result.registeredKinds).toContain('Sprite');
    expect(result.unusedRegistrations).toEqual(['DisplayObject']);
    expect(result.uncoveredKinds).toEqual([]);
  });

  it('reports uncovered kinds when the scene uses kinds with no registered renderer', () => {
    const state = createRenderState();
    registerNodeRenderer(state, 'Sprite', renderer);
    const root = createDisplayObject();
    const child = createSprite();
    addNodeChild(root, child);
    const customNode = createDisplayObject();
    (customNode as any).kind = 'CustomWidget';
    addNodeChild(root, customNode);
    const result = explainScene2DPipelineCoverage(state, root);
    expect(result.usedKinds).toEqual(['CustomWidget', 'DisplayObject', 'Sprite']);
    expect(result.uncoveredKinds).toEqual(['CustomWidget', 'DisplayObject']);
    expect(result.unusedRegistrations).toEqual([]);
  });

  it('returns empty arrays for an empty scene with an empty pipeline', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const result = explainScene2DPipelineCoverage(state, root);
    expect(result.usedKinds).toEqual(['DisplayObject']);
    expect(result.registeredKinds).toEqual([]);
    expect(result.unusedRegistrations).toEqual([]);
    expect(result.uncoveredKinds).toEqual(['DisplayObject']);
  });

  it('returns sorted, stable arrays', () => {
    const state = createRenderState();
    registerNodeRenderer(state, 'Sprite', renderer);
    registerNodeRenderer(state, 'DisplayObject', renderer);
    registerNodeRenderer(state, 'BitmapText', renderer);
    const root = createDisplayObject();
    const child = createSprite();
    addNodeChild(root, child);
    const result = explainScene2DPipelineCoverage(state, root);
    expect(result.usedKinds).toEqual(['DisplayObject', 'Sprite']);
    expect(result.registeredKinds).toEqual(['BitmapText', 'DisplayObject', 'Sprite']);
    expect(result.unusedRegistrations).toEqual(['BitmapText']);
    expect(result.uncoveredKinds).toEqual([]);
  });

  it('traverses the full scene tree iteratively', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const child1 = createSprite();
    const child2 = createDisplayObject();
    const grandchild = createSprite();
    addNodeChild(root, child1);
    addNodeChild(root, child2);
    addNodeChild(child2, grandchild);
    const result = explainScene2DPipelineCoverage(state, root);
    expect(result.usedKinds).toEqual(['DisplayObject', 'Sprite']);
  });
});
