import { matrix3x2 } from '@flighthq/geometry';

import { setDOMTransform, setDOMTransformWithOffset } from './domTransform';

describe('setDOMTransform', () => {
  it('sets the CSS transform to the matrix values', () => {
    const el = document.createElement('div');
    const t = matrix3x2.create(1, 2, 3, 4, 5, 6);

    setDOMTransform(el, t, false);

    expect(el.style.transform).toBe('matrix(1,2,3,4,5,6)');
  });

  it('passes tx and ty through without rounding when roundPixels is false', () => {
    const el = document.createElement('div');
    const t = matrix3x2.create(1, 0, 0, 1, 1.7, 2.3);

    setDOMTransform(el, t, false);

    expect(el.style.transform).toBe('matrix(1,0,0,1,1.7,2.3)');
  });

  it('frounds tx and ty when roundPixels is true', () => {
    const el = document.createElement('div');
    const t = matrix3x2.create(1, 0, 0, 1, 5.6789, 9.1011);

    setDOMTransform(el, t, true);

    const expectedTx = Math.fround(5.6789);
    const expectedTy = Math.fround(9.1011);
    expect(el.style.transform).toBe(`matrix(1,0,0,1,${expectedTx},${expectedTy})`);
  });
});

describe('setDOMTransformWithOffset', () => {
  it('applies offset through the transform before setting CSS matrix', () => {
    const el = document.createElement('div');
    const t = matrix3x2.create(1, 0, 0, 1, 10, 20);

    setDOMTransformWithOffset(el, t, 5, 8, false);

    // tx = 1*5 + 0*8 + 10 = 15, ty = 0*5 + 1*8 + 20 = 28
    expect(el.style.transform).toBe('matrix(1,0,0,1,15,28)');
  });

  it('applies offset through a rotated transform', () => {
    const el = document.createElement('div');
    // 90-degree rotation: a=0, b=1, c=-1, d=0
    const t = matrix3x2.create(0, 1, -1, 0, 0, 0);

    setDOMTransformWithOffset(el, t, 10, 20, false);

    // tx = 0*10 + (-1)*20 + 0 = -20, ty = 1*10 + 0*20 + 0 = 10
    expect(el.style.transform).toBe('matrix(0,1,-1,0,-20,10)');
  });

  it('frounds the adjusted tx/ty when roundPixels is true', () => {
    const el = document.createElement('div');
    const t = matrix3x2.create(1, 0, 0, 1, 0.5, 0.5);

    setDOMTransformWithOffset(el, t, 0.1, 0.1, true);

    const expectedTx = Math.fround(0.6);
    const expectedTy = Math.fround(0.6);
    expect(el.style.transform).toBe(`matrix(1,0,0,1,${expectedTx},${expectedTy})`);
  });
});
