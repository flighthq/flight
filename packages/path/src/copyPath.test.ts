import { clonePath, copyPath } from './copyPath';
import { appendPathLineTo, appendPathMoveTo, appendPathRectangle, createPath } from './path';

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
  it('allocates a new path when out is omitted', () => {
    const source = createPath();
    appendPathMoveTo(source, 5, 10);
    const result = copyPath(source);
    expect(result).not.toBe(source);
    expect(result.commands).toStrictEqual(source.commands);
    expect(result.data).toStrictEqual(source.data);
  });

  it('writes into out when provided', () => {
    const source = createPath();
    appendPathMoveTo(source, 1, 2);
    appendPathLineTo(source, 3, 4);
    const out = createPath('evenOdd');
    const result = copyPath(source, out);
    expect(result).toBe(out);
    expect(out.commands).toStrictEqual(source.commands);
    expect(out.data).toStrictEqual(source.data);
    expect(out.winding).toBe('nonZero');
  });

  it('is a no-op when out is the same object as source', () => {
    const source = createPath();
    appendPathMoveTo(source, 7, 8);
    const cmdsBefore = source.commands.slice();
    const dataBefore = source.data.slice();
    const result = copyPath(source, source);
    expect(result).toBe(source);
    expect(source.commands).toStrictEqual(cmdsBefore);
    expect(source.data).toStrictEqual(dataBefore);
  });
});
