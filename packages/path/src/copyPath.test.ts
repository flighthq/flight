import { clonePath, copyPath } from './copyPath.ts';
import { appendPathLineTo, appendPathMoveTo, appendPathRectangle, createPath } from './path.ts';

describe('clonePath', () => {
  it('returns a new path with the same commands and data', () => {
    const source = createPath('evenOdd');
    appendPathRectangle(source, 0, 0, 100, 50);
    const clone = clonePath(source);
    expect(clone).not.toBe(source);
    expect(clone.commands).toStrictEqual(source.commands);
    expect(clone.data).toStrictEqual(source.data);
    expect(clone.winding).toBe('evenOdd');
  });

  it('mutations to the clone do not affect the source', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    const clone = clonePath(source);
    clone.commands.push(99);
    expect(source.commands.length).toBe(1);
  });
});

describe('copyPath', () => {
  it('writes into out', () => {
    const source = createPath();
    appendPathMoveTo(source, 1, 2);
    appendPathLineTo(source, 3, 4);
    const out = createPath('evenOdd');
    copyPath(out, source);
    expect(out.commands).toStrictEqual(source.commands);
    expect(out.data).toStrictEqual(source.data);
    expect(out.winding).toBe('nonZero');
  });

  it('is a no-op when out is the same object as source', () => {
    const source = createPath();
    appendPathMoveTo(source, 7, 8);
    const cmdsBefore = source.commands.slice();
    const dataBefore = source.data.slice();
    copyPath(source, source);
    expect(source.commands).toStrictEqual(cmdsBefore);
    expect(source.data).toStrictEqual(dataBefore);
  });
});
