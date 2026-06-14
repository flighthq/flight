import { createMatrix } from '@flighthq/geometry';
import type { HasBoundsRectangleRuntime } from '@flighthq/types';

import {
  computeSceneAlignX,
  computeSceneAlignY,
  computeSceneFillScale,
  computeSceneFitScale,
  computeSceneRenderTransform,
  createScene,
} from './scene';
import { createSceneNode, getSceneNodeRuntime } from './sceneNode';

const TestGraph: unique symbol = Symbol('TestGraph');
const TestNodeKind: unique symbol = Symbol('TestNode');

function makeNodeWithBounds(width: number, height: number) {
  const node = createSceneNode(TestGraph, TestNodeKind);
  const runtime = getSceneNodeRuntime(node) as unknown as HasBoundsRectangleRuntime;
  runtime.computeLocalBoundsRectangle = (out) => {
    out.width = width;
    out.height = height;
  };
  return node;
}

describe('computeSceneAlignX', () => {
  it('returns 0 for left-anchored alignments', () => {
    expect(computeSceneAlignX(400, 800, 'left')).toBe(0);
    expect(computeSceneAlignX(400, 800, 'topleft')).toBe(0);
    expect(computeSceneAlignX(400, 800, 'bottomleft')).toBe(0);
  });

  it('returns viewWidth - scaledWidth for right-anchored alignments', () => {
    expect(computeSceneAlignX(400, 800, 'right')).toBe(400);
    expect(computeSceneAlignX(400, 800, 'topright')).toBe(400);
    expect(computeSceneAlignX(400, 800, 'bottomright')).toBe(400);
  });

  it('returns centered offset for top/bottom alignments', () => {
    expect(computeSceneAlignX(400, 800, 'top')).toBe(200);
    expect(computeSceneAlignX(400, 800, 'bottom')).toBe(200);
  });
});

describe('computeSceneAlignY', () => {
  it('returns 0 for top-anchored alignments', () => {
    expect(computeSceneAlignY(300, 600, 'top')).toBe(0);
    expect(computeSceneAlignY(300, 600, 'topleft')).toBe(0);
    expect(computeSceneAlignY(300, 600, 'topright')).toBe(0);
  });

  it('returns viewHeight - scaledHeight for bottom-anchored alignments', () => {
    expect(computeSceneAlignY(300, 600, 'bottom')).toBe(300);
    expect(computeSceneAlignY(300, 600, 'bottomleft')).toBe(300);
    expect(computeSceneAlignY(300, 600, 'bottomright')).toBe(300);
  });

  it('returns centered offset for left/right alignments', () => {
    expect(computeSceneAlignY(300, 600, 'left')).toBe(150);
    expect(computeSceneAlignY(300, 600, 'right')).toBe(150);
  });
});

describe('computeSceneFillScale', () => {
  it('returns max of width and height ratios', () => {
    expect(computeSceneFillScale(400, 300, 800, 600)).toBe(2);
  });

  it('uses the larger ratio when width ratio wins', () => {
    expect(computeSceneFillScale(400, 300, 800, 400)).toBeCloseTo(2);
  });

  it('uses the larger ratio when height ratio wins', () => {
    expect(computeSceneFillScale(400, 300, 400, 600)).toBe(2);
  });
});

describe('computeSceneFitScale', () => {
  it('returns min of width and height ratios', () => {
    expect(computeSceneFitScale(400, 300, 800, 600)).toBe(2);
  });

  it('uses the smaller ratio when width ratio wins', () => {
    expect(computeSceneFitScale(400, 300, 400, 600)).toBe(1);
  });

  it('uses the smaller ratio when height ratio wins', () => {
    expect(computeSceneFitScale(400, 300, 800, 400)).toBeCloseTo(400 / 300);
  });
});

describe('computeSceneRenderTransform', () => {
  it('sets identity when root is null', () => {
    const m = createMatrix();
    computeSceneRenderTransform(m, createScene(), 800, 600);
    expect(m.a).toBe(1);
    expect(m.b).toBe(0);
    expect(m.c).toBe(0);
    expect(m.d).toBe(1);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });

  it('sets identity when root has no bounds capability', () => {
    const m = createMatrix();
    const root = createSceneNode(TestGraph, TestNodeKind);
    computeSceneRenderTransform(m, createScene({ root }), 800, 600);
    expect(m.a).toBe(1);
    expect(m.d).toBe(1);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });

  it('sets identity when root computeLocalBoundsRectangle returns zero size', () => {
    const m = createMatrix();
    const root = makeNodeWithBounds(0, 0);
    computeSceneRenderTransform(m, createScene({ root }), 800, 600);
    expect(m.a).toBe(1);
    expect(m.d).toBe(1);
  });

  it('noscale with topleft: identity scale at origin', () => {
    const m = createMatrix();
    computeSceneRenderTransform(
      m,
      createScene({ root: makeNodeWithBounds(400, 300), scaleMode: 'noscale', align: 'topleft' }),
      800,
      600,
    );
    expect(m.a).toBe(1);
    expect(m.d).toBe(1);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });

  it('noscale with top alignment: centers horizontally', () => {
    const m = createMatrix();
    computeSceneRenderTransform(
      m,
      createScene({ root: makeNodeWithBounds(400, 300), scaleMode: 'noscale', align: 'top' }),
      800,
      600,
    );
    expect(m.a).toBe(1);
    expect(m.d).toBe(1);
    expect(m.tx).toBe(200);
    expect(m.ty).toBe(0);
  });

  it('exactfit: scales to fill viewport exactly', () => {
    const m = createMatrix();
    computeSceneRenderTransform(
      m,
      createScene({ root: makeNodeWithBounds(400, 300), scaleMode: 'exactfit', align: 'topleft' }),
      800,
      600,
    );
    expect(m.a).toBe(2);
    expect(m.d).toBe(2);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });

  it('exactfit: uses independent x/y scales', () => {
    const m = createMatrix();
    computeSceneRenderTransform(
      m,
      createScene({ root: makeNodeWithBounds(400, 300), scaleMode: 'exactfit', align: 'topleft' }),
      800,
      450,
    );
    expect(m.a).toBe(2);
    expect(m.d).toBe(1.5);
  });

  it('showall: fits content within viewport with uniform scale', () => {
    const m = createMatrix();
    // viewport 800x400, content 400x300: min(2, 400/300) = 400/300
    computeSceneRenderTransform(
      m,
      createScene({ root: makeNodeWithBounds(400, 300), scaleMode: 'showall', align: 'topleft' }),
      800,
      400,
    );
    expect(m.a).toBeCloseTo(400 / 300);
    expect(m.d).toBeCloseTo(400 / 300);
  });

  it('noborder: fills viewport with uniform scale', () => {
    const m = createMatrix();
    // viewport 800x400, content 400x300: max(2, 400/300) = 2
    computeSceneRenderTransform(
      m,
      createScene({ root: makeNodeWithBounds(400, 300), scaleMode: 'noborder', align: 'topleft' }),
      800,
      400,
    );
    expect(m.a).toBe(2);
    expect(m.d).toBe(2);
  });

  it('sets b and c to 0', () => {
    const m = createMatrix();
    computeSceneRenderTransform(
      m,
      createScene({ root: makeNodeWithBounds(400, 300), scaleMode: 'showall', align: 'topleft' }),
      800,
      600,
    );
    expect(m.b).toBe(0);
    expect(m.c).toBe(0);
  });
});

describe('createScene', () => {
  it('returns default values', () => {
    const scene = createScene();
    expect(scene.root).toBeNull();
    expect(scene.scaleMode).toBe('noscale');
    expect(scene.align).toBe('topleft');
  });

  it('accepts overrides', () => {
    const scene = createScene({ scaleMode: 'showall', align: 'top' });
    expect(scene.scaleMode).toBe('showall');
    expect(scene.align).toBe('top');
  });
});
