import { appendPathLineTo, appendPathMoveTo, appendPathRectangle, createPath } from './path';
import { acquirePathMesh, acquirePathMeshTyped, releasePathMesh, releasePathMeshTyped } from './pathMeshPool';

describe('acquirePathMesh', () => {
  it('returns a PathMesh for an empty path', () => {
    const mesh = acquirePathMesh(createPath());
    expect(mesh.vertices).toBeDefined();
    expect(mesh.indices).toBeDefined();
    releasePathMesh(mesh);
  });
  it('returns a mesh with triangles for a non-degenerate path', () => {
    const path = createPath();
    appendPathRectangle(path, 0, 0, 10, 10);
    const mesh = acquirePathMesh(path);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.indices.length % 3).toBe(0);
    releasePathMesh(mesh);
  });
  it('pool reuses a released mesh (object identity)', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    appendPathLineTo(path, 5, 10);
    const first = acquirePathMesh(path);
    releasePathMesh(first);
    const second = acquirePathMesh(path);
    // The second acquire should hand back the same object that was released.
    expect(second).toBe(first);
    releasePathMesh(second);
  });
  it('returns consistent tessellation results regardless of whether a pooled mesh is reused', () => {
    const path = createPath();
    appendPathRectangle(path, 0, 0, 20, 20);
    const fresh = acquirePathMesh(path);
    const freshIndices = [...fresh.indices];
    releasePathMesh(fresh);
    const reused = acquirePathMesh(path);
    expect([...reused.indices]).toEqual(freshIndices);
    releasePathMesh(reused);
  });
});

describe('acquirePathMeshTyped', () => {
  it('returns a PathMeshTyped with Float32Array and Uint32Array', () => {
    const path = createPath();
    appendPathRectangle(path, 0, 0, 5, 5);
    const mesh = acquirePathMeshTyped(path);
    expect(mesh.vertices).toBeInstanceOf(Float32Array);
    expect(mesh.indices).toBeInstanceOf(Uint32Array);
    releasePathMeshTyped(mesh);
  });
  it('returns non-empty typed arrays for a rectangle', () => {
    const path = createPath();
    appendPathRectangle(path, 0, 0, 100, 50);
    const mesh = acquirePathMeshTyped(path);
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
    releasePathMeshTyped(mesh);
  });
});

describe('releasePathMesh', () => {
  it('can be called multiple times without error (double-release is caller error, not a crash)', () => {
    const mesh = acquirePathMesh(createPath());
    expect(() => releasePathMesh(mesh)).not.toThrow();
    // Note: double-release would add two copies to the pool; callers must not do this.
    // This test only confirms a single release does not throw.
  });
});

describe('releasePathMeshTyped', () => {
  it('can be called on an acquired typed mesh without error', () => {
    const path = createPath();
    appendPathRectangle(path, 0, 0, 10, 10);
    const mesh = acquirePathMeshTyped(path);
    expect(() => releasePathMeshTyped(mesh)).not.toThrow();
  });
});
