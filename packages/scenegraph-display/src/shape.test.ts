import { ShapeKind } from '@flighthq/types';

import {
  clearShapeCommands,
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
