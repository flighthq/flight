import { appendPathRectangle, createPath } from './path';
import { tessellatePath } from './tessellatePath';
import { tessellatePathTyped, tessellatePathTypedInto } from './tessellatePathTyped';

describe('tessellatePathTyped', () => {
  it('returns Float32Array vertices and Uint32Array indices', () => {
    const path = createPath();
    appendPathRectangle(path, 0, 0, 100, 100);
    const mesh = tessellatePathTyped(path);
    expect(mesh.vertices).toBeInstanceOf(Float32Array);
    expect(mesh.indices).toBeInstanceOf(Uint32Array);
  });
  it('produces the same values as tessellatePath', () => {
    const path = createPath();
    appendPathRectangle(path, 10, 20, 80, 60);
    const typed = tessellatePathTyped(path);
    const plain = tessellatePath(path);
    expect(Array.from(typed.vertices)).toStrictEqual(plain.vertices);
    expect(Array.from(typed.indices)).toStrictEqual(plain.indices);
  });
  it('returns empty typed arrays for an empty path', () => {
    const mesh = tessellatePathTyped(createPath());
    expect(mesh.vertices.length).toBe(0);
    expect(mesh.indices.length).toBe(0);
  });
});

describe('tessellatePathTypedInto', () => {
  it('writes into an existing PathMeshTyped with the same values', () => {
    const path = createPath();
    appendPathRectangle(path, 0, 0, 100, 100);
    const expected = tessellatePath(path);
    const out = { vertices: new Float32Array(0), indices: new Uint32Array(0) };
    tessellatePathTypedInto(path, out);
    expect(Array.from(out.vertices).slice(0, expected.vertices.length)).toStrictEqual(expected.vertices);
    expect(Array.from(out.indices).slice(0, expected.indices.length)).toStrictEqual(expected.indices);
  });

  it('grows typed arrays when the mesh exceeds capacity', () => {
    const path = createPath();
    appendPathRectangle(path, 0, 0, 50, 50);
    const out = { vertices: new Float32Array(2), indices: new Uint32Array(1) };
    tessellatePathTypedInto(path, out);
    expect(out.vertices.length).toBeGreaterThanOrEqual(8);
    expect(out.indices.length).toBeGreaterThanOrEqual(6);
  });

  it('reuses typed arrays when capacity is sufficient', () => {
    const path = createPath();
    appendPathRectangle(path, 0, 0, 50, 50);
    const big = { vertices: new Float32Array(1000), indices: new Uint32Array(1000) };
    const vRef = big.vertices;
    const iRef = big.indices;
    tessellatePathTypedInto(path, big);
    expect(big.vertices).toBe(vRef);
    expect(big.indices).toBe(iRef);
  });
});
