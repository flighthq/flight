import { createRectangle } from '@flighthq/geometry';
import { ShapeKind } from '@flighthq/types';

import {
  clearShapeCommands,
  computeShapeLocalBoundsRect,
  copyShapeCommands,
  createShape,
  createShapeData,
  createShapeRuntime,
  getShapeRuntime,
} from './shape';

describe('clearShapeCommands', () => {
  it('empties the commands array', () => {
    const data = createShapeData();
    data.commands.push({ key: 'endFill', args: [] });
    clearShapeCommands(data);
    expect(data.commands).toHaveLength(0);
  });
});

describe('computeShapeLocalBoundsRect', () => {
  it('sets out to zero for an empty shape with no commands', () => {
    const shape = createShape();
    const out = createRectangle(1, 2, 3, 4);
    computeShapeLocalBoundsRect(out, shape as any);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });

  it('computes bounds from drawRect commands', () => {
    const shape = createShape();
    shape.data.commands.push('drawRect', 4, 10, 20, 100, 50);
    const out = createRectangle();
    computeShapeLocalBoundsRect(out, shape as any);
    expect(out.x).toBe(10);
    expect(out.y).toBe(20);
    expect(out.width).toBe(100);
    expect(out.height).toBe(50);
  });

  it('computes bounds from moveTo and lineTo commands', () => {
    const shape = createShape();
    shape.data.commands.push('moveTo', 2, 0, 0, 'lineTo', 2, 80, 60);
    const out = createRectangle();
    computeShapeLocalBoundsRect(out, shape as any);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(80);
    expect(out.height).toBe(60);
  });
});

describe('copyShapeCommands', () => {
  it('copies commands from source to target', () => {
    const source = createShapeData();
    source.commands.push({ key: 'endFill', args: [] });
    const target = createShapeData();
    copyShapeCommands(source, target);
    expect(target.commands).toHaveLength(1);
    expect(target.commands[0]).toEqual({ key: 'endFill', args: [] });
  });

  it('replaces existing target commands', () => {
    const source = createShapeData();
    source.commands.push({ key: 'endFill', args: [] });
    const target = createShapeData();
    target.commands.push({ key: 'endFill', args: [] });
    target.commands.push({ key: 'endFill', args: [] });
    copyShapeCommands(source, target);
    expect(target.commands).toHaveLength(1);
  });

  it('does not share the same array reference', () => {
    const source = createShapeData();
    const target = createShapeData();
    copyShapeCommands(source, target);
    expect(target.commands).not.toBe(source.commands);
  });
});

describe('createShape', () => {
  it('initializes with an empty commands array', () => {
    const shape = createShape();
    expect(shape.data.commands).toHaveLength(0);
    expect(shape.kind).toStrictEqual(ShapeKind);
  });

  it('allows pre-defined commands', () => {
    const commands = [{ key: 'endFill' as const, args: [] as const }];
    const shape = createShape({ data: { commands } });
    expect(shape.data.commands).toBe(commands);
  });

  it('returns a new object for better hidden-class performance', () => {
    expect(createShape()).not.toBe(createShape());
  });
});

describe('createShapeData', () => {
  it('returns a ShapeData object with an empty commands array', () => {
    const data = createShapeData();
    expect(data.commands).toHaveLength(0);
  });

  it('returns a new object each call', () => {
    expect(createShapeData()).not.toBe(createShapeData());
  });
});

describe('createShapeRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createShapeRuntime();
    expect(runtime).not.toBeNull();
  });
});

describe('getShapeRuntime', () => {
  it('returns the runtime for a Shape', () => {
    const shape = createShape();
    const runtime = getShapeRuntime(shape);
    expect(runtime).not.toBeNull();
  });
});
