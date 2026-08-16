import { createMatrix } from '@flighthq/geometry/contract';
import { getNodeLocalContentRevision } from '@flighthq/node/contract';
import { appendPathLineTo, appendPathMoveTo, createPath, createPathMorph } from '@flighthq/path/contract';

import { createMorphShape, setMorphShapeProgress } from './morphShape';
import {
  appendMorphShapeBeginFill,
  appendMorphShapeBeginGradientFill,
  appendMorphShapeBeginTextureFill,
  appendMorphShapeLineGradientStyle,
  appendMorphShapeLineStyle,
  appendMorphShapeLineTextureStyle,
  sampleMorphShapePaintBindings,
} from './morphShapePaint';
import { clearShapeCommands } from './shape';

const fakeTexture = { id: 1 } as never;

describe('appendMorphShapeBeginFill', () => {
  it('retains one command while sampling packed RGB and alpha at the current progress', () => {
    const shape = createTestMorphShape(0.5);

    appendMorphShapeBeginFill(shape, { alpha: 0.25, color: 0xff0000ff }, { alpha: 0.75, color: 0x0000ffff });

    expect(shape.data.commands).toStrictEqual(['beginFill', 2, 0x800080ff, 0.5]);
    expect(shape.data.paintBindings).toHaveLength(1);
    const commands = shape.data.commands;
    setMorphShapeProgress(shape, 1);
    expect(shape.data.commands).toBe(commands);
    expect(shape.data.commands).toStrictEqual(['beginFill', 2, 0x0000ffff, 0.75]);
  });
});

describe('appendMorphShapeBeginGradientFill', () => {
  it('samples stops, matrices, and focal ratio into stable retained values', () => {
    const shape = createTestMorphShape();
    const startMatrix = createMatrix(1, 2, 3, 4, 5, 6);
    const endMatrix = createMatrix(3, 4, 5, 6, 7, 8);

    expect(
      appendMorphShapeBeginGradientFill(
        shape,
        'radial',
        {
          alphas: [0.25, 0.5],
          colors: [0x000000ff, 0xff0000ff],
          focalPointRatio: -0.5,
          matrix: startMatrix,
          ratios: [0, 100],
        },
        {
          alphas: [0.75, 1],
          colors: [0xffffffff, 0x0000ffff],
          focalPointRatio: 0.5,
          matrix: endMatrix,
          ratios: [100, 200],
        },
      ),
    ).toBe(true);
    const colors = shape.data.commands[3];
    const alphas = shape.data.commands[4];
    const ratios = shape.data.commands[5];
    const matrix = shape.data.commands[6];

    setMorphShapeProgress(shape, 0.5);

    expect(shape.data.commands[3]).toBe(colors);
    expect(shape.data.commands[4]).toBe(alphas);
    expect(shape.data.commands[5]).toBe(ratios);
    expect(shape.data.commands[6]).toBe(matrix);
    expect(colors).toStrictEqual([0x808080ff, 0x800080ff]);
    expect(alphas).toStrictEqual([0.5, 0.75]);
    expect(ratios).toStrictEqual([50, 150]);
    expect(matrix).toMatchObject({ a: 2, b: 3, c: 4, d: 5, tx: 6, ty: 7 });
    expect(shape.data.commands[9]).toBe(0);
  });

  it('rejects incompatible gradient stop topology without mutating the shape', () => {
    const shape = createTestMorphShape();
    const revision = getNodeLocalContentRevision(shape);

    expect(
      appendMorphShapeBeginGradientFill(
        shape,
        'linear',
        { alphas: [1], colors: [0x000000ff], ratios: [0] },
        { alphas: [1, 1], colors: [0x000000ff, 0xffffffff], ratios: [0, 255] },
      ),
    ).toBe(false);
    expect(shape.data.commands).toStrictEqual([]);
    expect(shape.data.paintBindings).toStrictEqual([]);
    expect(getNodeLocalContentRevision(shape)).toBe(revision);
  });

  it('treats a missing endpoint matrix as identity while retaining one live matrix', () => {
    const shape = createTestMorphShape();
    expect(
      appendMorphShapeBeginGradientFill(
        shape,
        'linear',
        { alphas: [1], colors: [0x000000ff], ratios: [0] },
        { alphas: [1], colors: [0xffffffff], matrix: createMatrix(3, 0, 0, 5, 20, 40), ratios: [255] },
      ),
    ).toBe(true);
    const matrix = shape.data.commands[6];

    setMorphShapeProgress(shape, 0.5);

    expect(shape.data.commands[6]).toBe(matrix);
    expect(matrix).toMatchObject({ a: 2, b: 0, c: 0, d: 3, tx: 10, ty: 20 });
  });
});

describe('appendMorphShapeBeginTextureFill', () => {
  it('preserves an ordinary null matrix when neither endpoint needs placement morphing', () => {
    const shape = createTestMorphShape();

    appendMorphShapeBeginTextureFill(shape, fakeTexture);

    expect(shape.data.commands).toStrictEqual(['beginTextureFill', 2, fakeTexture, null]);
    expect(shape.data.paintBindings).toStrictEqual([]);
  });

  it('morphs the placement matrix while retaining the texture and matrix identities', () => {
    const shape = createTestMorphShape();
    appendMorphShapeBeginTextureFill(shape, fakeTexture, null, createMatrix(2, 0, 0, 4, 10, 20));
    const matrix = shape.data.commands[3];

    setMorphShapeProgress(shape, 0.5);

    expect(shape.data.commands[2]).toBe(fakeTexture);
    expect(shape.data.commands[3]).toBe(matrix);
    expect(matrix).toMatchObject({ a: 1.5, b: 0, c: 0, d: 2.5, tx: 5, ty: 10 });
  });
});

describe('appendMorphShapeLineGradientStyle', () => {
  it('uses the same stable gradient sampler for a stroke paint', () => {
    const shape = createTestMorphShape();

    expect(
      appendMorphShapeLineGradientStyle(
        shape,
        'linear',
        { alphas: [1], colors: [0xff0000ff], ratios: [0] },
        { alphas: [0.5], colors: [0x0000ffff], ratios: [255] },
      ),
    ).toBe(true);
    setMorphShapeProgress(shape, 1);

    expect(shape.data.commands[0]).toBe('lineGradientStyle');
    expect(shape.data.commands[3]).toStrictEqual([0x0000ffff]);
    expect(shape.data.commands[4]).toStrictEqual([0.5]);
    expect(shape.data.commands[5]).toStrictEqual([255]);
  });
});

describe('appendMorphShapeLineStyle', () => {
  it('samples stroke width and color while retaining structural stroke options', () => {
    const shape = createTestMorphShape(0.5);

    appendMorphShapeLineStyle(
      shape,
      { alpha: 0.25, color: 0xff0000ff, thickness: 2 },
      { alpha: 0.75, color: 0x0000ffff, thickness: 10 },
      true,
      'horizontal',
      'round',
      'bevel',
      5,
    );

    expect(shape.data.commands).toStrictEqual([
      'lineStyle',
      8,
      6,
      0x800080ff,
      0.5,
      true,
      'horizontal',
      'round',
      'bevel',
      5,
    ]);
  });
});

describe('appendMorphShapeLineTextureStyle', () => {
  it('uses the same stable matrix sampler for a stroke texture', () => {
    const shape = createTestMorphShape();
    appendMorphShapeLineTextureStyle(shape, fakeTexture, createMatrix(), createMatrix(2, 0, 0, 2, 10, 20));
    const matrix = shape.data.commands[3];

    setMorphShapeProgress(shape, 1);

    expect(shape.data.commands[0]).toBe('lineTextureStyle');
    expect(shape.data.commands[3]).toBe(matrix);
    expect(matrix).toMatchObject({ a: 2, d: 2, tx: 10, ty: 20 });
  });
});

describe('clearShapeCommands with MorphShape paint', () => {
  it('removes stale paint bindings with the ordinary Shape command stream', () => {
    const shape = createTestMorphShape();
    appendMorphShapeBeginFill(shape, { color: 0x000000ff }, { color: 0xffffffff });

    clearShapeCommands(shape);
    setMorphShapeProgress(shape, 1);

    expect(shape.data.commands).toStrictEqual([]);
    expect(shape.data.paintBindings).toStrictEqual([]);
  });
});

describe('sampleMorphShapePaintBindings', () => {
  it('can resample prepared paint bindings without reallocating their command values', () => {
    const shape = createTestMorphShape();
    appendMorphShapeBeginFill(shape, { color: 0x000000ff }, { color: 0xffffffff });
    const commands = shape.data.commands;

    sampleMorphShapePaintBindings(shape.data, 0.25);

    expect(shape.data.commands).toBe(commands);
    expect(shape.data.commands[2]).toBe(0x404040ff);
  });
});

function createTestMorphShape(progress = 0) {
  const start = createPath();
  appendPathMoveTo(start, 0, 0);
  appendPathLineTo(start, 10, 0);
  const end = createPath();
  appendPathMoveTo(end, 20, 30);
  appendPathLineTo(end, 40, 30);
  return createMorphShape(createPathMorph(start, end)!, { data: { progress } });
}
