import { createRectangle } from '@flighthq/geometry/contract';
import type { Node, RenderTargetNode2D } from '@flighthq/types/contract';
import { RenderTargetNode2DKind } from '@flighthq/types/contract';

import {
  computeRenderTargetNode2DLocalBoundsRectangle,
  createRenderTargetNode2D,
  createRenderTargetNode2DData,
  createRenderTargetNode2DRuntime,
  getRenderTargetNode2DRuntime,
  setRenderTargetNode2DSize,
} from './renderTargetNode2D';

describe('computeRenderTargetNode2DLocalBoundsRectangle', () => {
  it('writes width and height from data', () => {
    const node = createRenderTargetNode2D({ width: 400, height: 300 });
    const out = createRectangle(0, 0, 0, 0);

    computeRenderTargetNode2DLocalBoundsRectangle(out, node as unknown as Node);

    expect(out.width).toBe(400);
    expect(out.height).toBe(300);
  });
});

describe('createRenderTargetNode2D', () => {
  it('creates a node with the requested dimensions and no depth by default', () => {
    const node = createRenderTargetNode2D({ width: 320, height: 240 });

    expect(node.data.depth).toBe(false);
    expect(node.data.height).toBe(240);
    expect(node.data.width).toBe(320);
    expect(node.kind).toBe(RenderTargetNode2DKind);
  });

  it('enables a depth attachment when requested', () => {
    const node = createRenderTargetNode2D({ width: 320, height: 240, depth: true });

    expect(node.data.depth).toBe(true);
  });
});

describe('createRenderTargetNode2DData', () => {
  it('returns default values', () => {
    const data = createRenderTargetNode2DData();

    expect(data.depth).toBe(false);
    expect(data.height).toBe(0);
    expect(data.width).toBe(0);
  });

  it('allows predefined values', () => {
    const data = createRenderTargetNode2DData({ depth: true, height: 600, width: 800 });

    expect(data.depth).toBe(true);
    expect(data.height).toBe(600);
    expect(data.width).toBe(800);
  });
});

describe('createRenderTargetNode2DRuntime', () => {
  it('returns a non-null runtime', () => {
    expect(createRenderTargetNode2DRuntime()).not.toBeNull();
  });
});

describe('getRenderTargetNode2DRuntime', () => {
  it('returns the node runtime', () => {
    const node = createRenderTargetNode2D({ width: 1, height: 1 });

    expect(getRenderTargetNode2DRuntime(node)).not.toBeNull();
  });
});

describe('setRenderTargetNode2DSize', () => {
  let node: RenderTargetNode2D;

  beforeEach(() => {
    node = createRenderTargetNode2D({ width: 100, height: 100 });
  });

  it('updates width and height', () => {
    setRenderTargetNode2DSize(node, 640, 480);

    expect(node.data.width).toBe(640);
    expect(node.data.height).toBe(480);
  });

  it('is a no-op when size is unchanged', () => {
    const runtime = getRenderTargetNode2DRuntime(node);
    const before = runtime.localBoundsId;

    setRenderTargetNode2DSize(node, 100, 100);

    expect(runtime.localBoundsId).toBe(before);
  });
});
