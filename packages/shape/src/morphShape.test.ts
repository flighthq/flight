import { createRectangle } from '@flighthq/geometry/contract';
import { getNodeLocalContentRevision } from '@flighthq/node/contract';
import { appendPathLineTo, appendPathMoveTo, createPath, createPathMorph } from '@flighthq/path/contract';
import type { PathMorph, ShapeCommandToken } from '@flighthq/types/contract';
import { MorphShapeKind } from '@flighthq/types/contract';

import {
  appendMorphShapePath,
  createMorphShape,
  createMorphShapeData,
  createMorphShapeRuntime,
  getMorphShapeRuntime,
  setMorphShapeProgress,
} from './morphShape';
import { getShapeBounds } from './shape';
import { appendShapeBeginFill, appendShapeEndFill } from './shapeCommands';

describe('appendMorphShapePath', () => {
  it('inserts the live path between ordinary Shape styling commands', () => {
    const shape = createMorphShape(createTestMorph());
    appendShapeBeginFill(shape, 0x336699, 0.75);

    appendMorphShapePath(shape);
    appendShapeEndFill(shape);

    expect(shape.data.commands).toStrictEqual([
      'beginFill',
      2,
      0x336699,
      0.75,
      'drawPath',
      3,
      shape.data.path.commands,
      shape.data.path.data,
      'nonZero',
      'endFill',
      0,
    ]);
    expect(shape.data.commands[6]).toBe(shape.data.path.commands);
    expect(shape.data.commands[7]).toBe(shape.data.path.data);
  });
});

describe('createMorphShape', () => {
  it('creates a distinct MorphShape over the prepared start sample', () => {
    const morph = createTestMorph();

    const shape = createMorphShape(morph);

    expect(shape.kind).toBe(MorphShapeKind);
    expect(shape.data.commands).toStrictEqual([]);
    expect(shape.data.morph).toBe(morph);
    expect(shape.data.path.commands).toStrictEqual(morph.commands);
    expect(shape.data.path.data).toStrictEqual(morph.startData);
    expect(shape.data.progress).toBe(0);
  });

  it('uses initial progress and a provided command buffer', () => {
    const commands: ShapeCommandToken[] = ['beginFill', 2, 0xff0000, 1];

    const shape = createMorphShape(createTestMorph(), { data: { commands, progress: 0.5 } });

    expect(shape.data.commands).toBe(commands);
    expect(shape.data.path.data).toStrictEqual([5, 10, 10, 10, 15, 10, 20, 10]);
    expect(shape.data.progress).toBe(0.5);
  });

  it('owns a distinct sampled path for each retained shape', () => {
    const morph = createTestMorph();

    const a = createMorphShape(morph);
    const b = createMorphShape(morph);

    expect(a).not.toBe(b);
    expect(a.data.path).not.toBe(b.data.path);
    expect(a.data.path.commands).not.toBe(b.data.path.commands);
    expect(a.data.path.data).not.toBe(b.data.path.data);
  });
});

describe('createMorphShapeData', () => {
  it('samples the requested initial endpoint exactly', () => {
    const morph = createTestMorph();

    const data = createMorphShapeData(morph, { progress: 1 });

    expect(data.path.data).toStrictEqual(morph.endData);
  });
});

describe('createMorphShapeRuntime', () => {
  it('creates the standard Shape bounds runtime', () => {
    expect(createMorphShapeRuntime().computeLocalBoundsRectangle).toBeTypeOf('function');
  });
});

describe('getMorphShapeRuntime', () => {
  it('returns the runtime attached to the retained shape', () => {
    expect(getMorphShapeRuntime(createMorphShape(createTestMorph()))).not.toBeNull();
  });
});

describe('setMorphShapeProgress', () => {
  it('resamples stable buffers, stores progress, and invalidates content', () => {
    const shape = createMorphShape(createTestMorph());
    appendMorphShapePath(shape);
    const commands = shape.data.path.commands;
    const data = shape.data.path.data;
    const revision = getNodeLocalContentRevision(shape);

    setMorphShapeProgress(shape, 0.5);

    expect(shape.data.progress).toBe(0.5);
    expect(shape.data.path.commands).toBe(commands);
    expect(shape.data.path.data).toBe(data);
    expect(shape.data.path.data).toStrictEqual([5, 10, 10, 10, 15, 10, 20, 10]);
    expect(getNodeLocalContentRevision(shape)).toBe(revision + 1);
  });

  it('updates the bounds observed through the ordinary Shape runtime', () => {
    const shape = createMorphShape(createTestMorph());
    appendMorphShapePath(shape);
    const bounds = createRectangle();
    getShapeBounds(bounds, shape);
    expect(bounds).toMatchObject({ x: 0, y: 0, width: 10, height: 0 });

    setMorphShapeProgress(shape, 1);
    getShapeBounds(bounds, shape);

    expect(bounds).toMatchObject({ x: 10, y: 20, width: 20, height: 0 });
  });

  it('preserves unclamped easing overshoot', () => {
    const shape = createMorphShape(createTestMorph());

    setMorphShapeProgress(shape, 1.5);

    expect(shape.data.path.data.slice(0, 2)).toStrictEqual([15, 30]);
  });
});

function createTestMorph(): PathMorph {
  const start = createPath();
  appendPathMoveTo(start, 0, 0);
  appendPathLineTo(start, 10, 0);
  const end = createPath();
  appendPathMoveTo(end, 10, 20);
  appendPathLineTo(end, 30, 20);
  return createPathMorph(start, end)!;
}
