import { createMatrix } from '@flighthq/geometry';
import type { HasBoundsRectangleRuntime, Node, NodeTraits, ViewportAlign, ViewportScaleMode } from '@flighthq/types';

import { createNode, getNodeRuntime } from './node';
import {
  computeStageFitAlignX,
  computeStageFitAlignY,
  computeStageFitFillScale,
  computeStageFitScale,
  computeStageFitTransform,
} from './stageFit';

const TestNodeKind = 'TestNode';

function makeNodeWithBounds(width: number, height: number) {
  const node = createNode(TestNodeKind);
  const runtime = getNodeRuntime(node) as unknown as HasBoundsRectangleRuntime;
  runtime.computeLocalBoundsRectangle = (out) => {
    out.width = width;
    out.height = height;
  };
  return node;
}

// A structural stage-fit context (what Stage supplies): root plus how it maps into the view.
function fit(overrides: { align?: ViewportAlign; root?: Node<NodeTraits> | null; scaleMode?: ViewportScaleMode }): {
  align: ViewportAlign;
  root: Node<NodeTraits> | null;
  scaleMode: ViewportScaleMode;
} {
  return {
    align: overrides.align ?? 'topleft',
    root: overrides.root ?? null,
    scaleMode: overrides.scaleMode ?? 'noscale',
  };
}

describe('computeStageFitAlignX', () => {
  it('returns 0 for left-anchored alignments', () => {
    expect(computeStageFitAlignX(400, 800, 'left')).toBe(0);
    expect(computeStageFitAlignX(400, 800, 'topleft')).toBe(0);
    expect(computeStageFitAlignX(400, 800, 'bottomleft')).toBe(0);
  });

  it('returns viewWidth - scaledWidth for right-anchored alignments', () => {
    expect(computeStageFitAlignX(400, 800, 'right')).toBe(400);
    expect(computeStageFitAlignX(400, 800, 'topright')).toBe(400);
    expect(computeStageFitAlignX(400, 800, 'bottomright')).toBe(400);
  });

  it('returns centered offset for top/bottom alignments', () => {
    expect(computeStageFitAlignX(400, 800, 'top')).toBe(200);
    expect(computeStageFitAlignX(400, 800, 'bottom')).toBe(200);
  });
});

describe('computeStageFitAlignY', () => {
  it('returns 0 for top-anchored alignments', () => {
    expect(computeStageFitAlignY(300, 600, 'top')).toBe(0);
    expect(computeStageFitAlignY(300, 600, 'topleft')).toBe(0);
    expect(computeStageFitAlignY(300, 600, 'topright')).toBe(0);
  });

  it('returns viewHeight - scaledHeight for bottom-anchored alignments', () => {
    expect(computeStageFitAlignY(300, 600, 'bottom')).toBe(300);
    expect(computeStageFitAlignY(300, 600, 'bottomleft')).toBe(300);
    expect(computeStageFitAlignY(300, 600, 'bottomright')).toBe(300);
  });

  it('returns centered offset for left/right alignments', () => {
    expect(computeStageFitAlignY(300, 600, 'left')).toBe(150);
    expect(computeStageFitAlignY(300, 600, 'right')).toBe(150);
  });
});

describe('computeStageFitFillScale', () => {
  it('returns max of width and height ratios', () => {
    expect(computeStageFitFillScale(400, 300, 800, 600)).toBe(2);
  });

  it('uses the larger ratio when width ratio wins', () => {
    expect(computeStageFitFillScale(400, 300, 800, 400)).toBeCloseTo(2);
  });

  it('uses the larger ratio when height ratio wins', () => {
    expect(computeStageFitFillScale(400, 300, 400, 600)).toBe(2);
  });
});

describe('computeStageFitScale', () => {
  it('returns min of width and height ratios', () => {
    expect(computeStageFitScale(400, 300, 800, 600)).toBe(2);
  });

  it('uses the smaller ratio when width ratio wins', () => {
    expect(computeStageFitScale(400, 300, 400, 600)).toBe(1);
  });

  it('uses the smaller ratio when height ratio wins', () => {
    expect(computeStageFitScale(400, 300, 800, 400)).toBeCloseTo(400 / 300);
  });
});

describe('computeStageFitTransform', () => {
  it('sets identity when root is null', () => {
    const m = createMatrix();
    computeStageFitTransform(m, fit({}), 800, 600);
    expect(m.a).toBe(1);
    expect(m.b).toBe(0);
    expect(m.c).toBe(0);
    expect(m.d).toBe(1);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });

  it('sets identity when root has no bounds capability', () => {
    const m = createMatrix();
    const root = createNode(TestNodeKind);
    computeStageFitTransform(m, fit({ root }), 800, 600);
    expect(m.a).toBe(1);
    expect(m.d).toBe(1);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });

  it('sets identity when root computeLocalBoundsRectangle returns zero size', () => {
    const m = createMatrix();
    const root = makeNodeWithBounds(0, 0);
    computeStageFitTransform(m, fit({ root }), 800, 600);
    expect(m.a).toBe(1);
    expect(m.d).toBe(1);
  });

  it('noscale with topleft: identity scale at origin', () => {
    const m = createMatrix();
    computeStageFitTransform(
      m,
      fit({ align: 'topleft', root: makeNodeWithBounds(400, 300), scaleMode: 'noscale' }),
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
    computeStageFitTransform(
      m,
      fit({ align: 'top', root: makeNodeWithBounds(400, 300), scaleMode: 'noscale' }),
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
    computeStageFitTransform(
      m,
      fit({ align: 'topleft', root: makeNodeWithBounds(400, 300), scaleMode: 'exactfit' }),
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
    computeStageFitTransform(
      m,
      fit({ align: 'topleft', root: makeNodeWithBounds(400, 300), scaleMode: 'exactfit' }),
      800,
      450,
    );
    expect(m.a).toBe(2);
    expect(m.d).toBe(1.5);
  });

  it('showall: fits content within viewport with uniform scale', () => {
    const m = createMatrix();
    computeStageFitTransform(
      m,
      fit({ align: 'topleft', root: makeNodeWithBounds(400, 300), scaleMode: 'showall' }),
      800,
      400,
    );
    expect(m.a).toBeCloseTo(400 / 300);
    expect(m.d).toBeCloseTo(400 / 300);
  });

  it('noborder: fills viewport with uniform scale', () => {
    const m = createMatrix();
    computeStageFitTransform(
      m,
      fit({ align: 'topleft', root: makeNodeWithBounds(400, 300), scaleMode: 'noborder' }),
      800,
      400,
    );
    expect(m.a).toBe(2);
    expect(m.d).toBe(2);
  });

  it('sets b and c to 0', () => {
    const m = createMatrix();
    computeStageFitTransform(
      m,
      fit({ align: 'topleft', root: makeNodeWithBounds(400, 300), scaleMode: 'showall' }),
      800,
      600,
    );
    expect(m.b).toBe(0);
    expect(m.c).toBe(0);
  });
});
