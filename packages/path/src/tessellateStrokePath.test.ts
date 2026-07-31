import { appendPathClose, appendPathLineTo, appendPathMoveTo, appendPathRectangle, createPath } from './path';
import { tessellateStrokePath } from './tessellateStrokePath';

describe('tessellateStrokePath', () => {
  it('tessellates an open butt-capped line without overlapping triangles', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    const mesh = tessellateStrokePath(path, { cap: 'butt', width: 10 });
    expect(mesh).not.toBeNull();
    expect(mesh!.indices.length).toBe(6);
    expect(getMeshArea(mesh!)).toBeCloseTo(1000, 6);
  });

  it('tessellates a closed rectangle as a hollow ring', () => {
    const path = createPath();
    appendPathRectangle(path, 0, 0, 100, 50);
    const mesh = tessellateStrokePath(path, { join: 'miter', width: 10 });
    expect(mesh).not.toBeNull();
    // Outer 110×60 minus inner 90×40 = 3000. Filling both contours would be 10200 instead.
    expect(getMeshArea(mesh!)).toBeCloseTo(3000, 6);
  });

  it('normalizes an explicit CLOSE and a return-to-start centerline to the same ring', () => {
    const closed = createPath();
    appendPathRectangle(closed, 0, 0, 100, 50);
    const returned = createPath();
    appendPathMoveTo(returned, 0, 0);
    appendPathLineTo(returned, 100, 0);
    appendPathLineTo(returned, 100, 50);
    appendPathLineTo(returned, 0, 50);
    appendPathLineTo(returned, 0, 0);
    expect(tessellateStrokePath(closed, { width: 10 })).toEqual(tessellateStrokePath(returned, { width: 10 }));
  });

  it('uses the same round-join sampling tolerance as stroke outlines', () => {
    const path = createPath();
    appendPathRectangle(path, 0, 0, 100, 50);
    const fine = tessellateStrokePath(path, { join: 'round', width: 10 }, 0.1);
    const coarse = tessellateStrokePath(path, { join: 'round', width: 10 }, 5);
    expect(fine).not.toBeNull();
    expect(coarse).not.toBeNull();
    expect(fine!.vertices.length).toBeGreaterThan(coarse!.vertices.length);
  });

  it('turns a dashed closed path into independently capped open stroke pieces', () => {
    const path = createPath();
    appendPathRectangle(path, 0, 0, 100, 50);
    const mesh = tessellateStrokePath(path, { cap: 'round', dash: [20, 10], width: 6 });
    expect(mesh).not.toBeNull();
    expect(mesh!.indices.length).toBeGreaterThan(6);
  });

  it('returns null for a self-intersecting centerline', () => {
    const path = bowTie();
    expect(tessellateStrokePath(path, { width: 8 })).toBeNull();
  });

  it('returns null for invalid stroke dimensions instead of emitting non-finite geometry', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    expect(tessellateStrokePath(path, { width: 0 })).toBeNull();
    expect(tessellateStrokePath(path, { width: Number.NaN })).toBeNull();
  });
});

function bowTie() {
  const path = createPath();
  appendPathMoveTo(path, 0, 0);
  appendPathLineTo(path, 40, 40);
  appendPathLineTo(path, 0, 40);
  appendPathLineTo(path, 40, 0);
  appendPathClose(path);
  return path;
}

function getMeshArea(mesh: { indices: readonly number[]; vertices: readonly number[] }): number {
  let area = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] * 2;
    const b = mesh.indices[i + 1] * 2;
    const c = mesh.indices[i + 2] * 2;
    area +=
      Math.abs(
        (mesh.vertices[b] - mesh.vertices[a]) * (mesh.vertices[c + 1] - mesh.vertices[a + 1]) -
          (mesh.vertices[b + 1] - mesh.vertices[a + 1]) * (mesh.vertices[c] - mesh.vertices[a]),
      ) / 2;
  }
  return area;
}
