import { createRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRevision, getNodeLocalContentRevision } from '@flighthq/node';
import { ShapeKind } from '@flighthq/types';

import {
  clearShapeCommands,
  computeShapeLocalBoundsRectangle,
  copyShapeCommands,
  createShape,
  createShapeData,
  createShapeRuntime,
  getShapeRuntime,
  invalidateShapeGeometry,
} from './shape';

describe('clearShapeCommands', () => {
  it('empties the commands array and bumps the content revision', () => {
    const shape = createShape();
    shape.data.commands.push('endFill', 0);
    const content = getNodeLocalContentRevision(shape);
    clearShapeCommands(shape);
    expect(shape.data.commands).toHaveLength(0);
    expect(getNodeLocalContentRevision(shape)).toBe(content + 1);
  });
});

describe('computeShapeLocalBoundsRectangle', () => {
  it('sets out to zero for an empty shape with no commands', () => {
    const shape = createShape();
    const out = createRectangle(1, 2, 3, 4);
    computeShapeLocalBoundsRectangle(out, shape as any);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });

  it('computes bounds from drawRectangle commands', () => {
    const shape = createShape();
    shape.data.commands.push('drawRectangle', 4, 10, 20, 100, 50);
    const out = createRectangle();
    computeShapeLocalBoundsRectangle(out, shape as any);
    expect(out.x).toBe(10);
    expect(out.y).toBe(20);
    expect(out.width).toBe(100);
    expect(out.height).toBe(50);
  });

  it('computes bounds from moveTo and lineTo commands', () => {
    const shape = createShape();
    shape.data.commands.push('moveTo', 2, 0, 0, 'lineTo', 2, 80, 60);
    const out = createRectangle();
    computeShapeLocalBoundsRectangle(out, shape as any);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(80);
    expect(out.height).toBe(60);
  });
});

describe('copyShapeCommands', () => {
  it('copies commands from source to target', () => {
    const source = createShape();
    source.data.commands.push({ key: 'endFill', args: [] });
    const target = createShape();
    copyShapeCommands(target, source);
    expect(target.data.commands).toHaveLength(1);
    expect(target.data.commands[0]).toEqual({ key: 'endFill', args: [] });
  });

  it('replaces existing target commands and bumps the content revision', () => {
    const source = createShape();
    source.data.commands.push({ key: 'endFill', args: [] });
    const target = createShape();
    target.data.commands.push({ key: 'endFill', args: [] });
    target.data.commands.push({ key: 'endFill', args: [] });
    const content = getNodeLocalContentRevision(target);
    copyShapeCommands(target, source);
    expect(target.data.commands).toHaveLength(1);
    expect(getNodeLocalContentRevision(target)).toBe(content + 1);
  });

  it('does not share the same array reference', () => {
    const source = createShape();
    const target = createShape();
    copyShapeCommands(target, source);
    expect(target.data.commands).not.toBe(source.data.commands);
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

describe('invalidateShapeGeometry', () => {
  it('bumps both the content and local-bounds revisions', () => {
    const shape = createShape();
    const content = getNodeLocalContentRevision(shape);
    const bounds = getNodeLocalBoundsRevision(shape);
    invalidateShapeGeometry(shape);
    expect(getNodeLocalContentRevision(shape)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(shape)).toBe(bounds + 1);
  });
});
