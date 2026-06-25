import { appendPathRectangle, createPath } from './path';
import { tessellatePath } from './tessellatePath';
import { tessellatePathTyped } from './tessellatePathTyped';

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
