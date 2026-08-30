import type { StrokeStyle } from '@flighthq/types/contract';

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

  // The sharing contract on StrokeTessellator, which exists because a derived render pipeline
  // INHERITS the tessellator bound to its source — one function object serves every state in that
  // lineage. Each probe below asserts a property nothing else in this suite covers.
  //
  // Every one of them is grounded in a mesh asserted NONEMPTY first. A degenerate path returns an
  // empty mesh, and against an empty mesh all four probes pass while proving nothing: two empty
  // results always match, always have distinct empty arrays, and never disturb each other.

  it('returns a nonempty mesh for the fixtures the sharing probes rely on', () => {
    expect(tessellateStrokePath(makeOpenPath(), OPEN_STYLE)!.vertices.length).toBeGreaterThan(0);
    expect(tessellateStrokePath(makeClosedPath(), CLOSED_STYLE, 0.1)!.vertices.length).toBeGreaterThan(0);
  });

  it('returns identical geometry when calls for two paths are interleaved', () => {
    const openBaseline = JSON.stringify(tessellateStrokePath(makeOpenPath(), OPEN_STYLE));
    const closedBaseline = JSON.stringify(tessellateStrokePath(makeClosedPath(), CLOSED_STYLE, 0.1));
    let drifted = 0;
    for (let i = 0; i < 50; i++) {
      if (JSON.stringify(tessellateStrokePath(makeOpenPath(), OPEN_STYLE)) !== openBaseline) drifted++;
      if (JSON.stringify(tessellateStrokePath(makeClosedPath(), CLOSED_STYLE, 0.1)) !== closedBaseline) drifted++;
    }
    expect(drifted).toBe(0);
  });

  it('allocates fresh result arrays for every call', () => {
    const first = tessellateStrokePath(makeOpenPath(), OPEN_STYLE)!;
    const second = tessellateStrokePath(makeOpenPath(), OPEN_STYLE)!;
    expect(first.vertices).not.toBe(second.vertices);
    expect(first.indices).not.toBe(second.indices);
  });

  it('is unaffected by a caller mutating an earlier result', () => {
    const baseline = JSON.stringify(tessellateStrokePath(makeOpenPath(), OPEN_STYLE));
    const owned = tessellateStrokePath(makeOpenPath(), OPEN_STYLE)!;
    owned.vertices.length = 0;
    owned.indices.push(999_999);
    expect(JSON.stringify(tessellateStrokePath(makeOpenPath(), OPEN_STYLE))).toBe(baseline);
  });

  it('is reentrant when a nested call runs inside an in-progress one', () => {
    const openBaseline = JSON.stringify(tessellateStrokePath(makeOpenPath(), OPEN_STYLE));
    const closedBaseline = JSON.stringify(tessellateStrokePath(makeClosedPath(), CLOSED_STYLE, 0.1));
    let nestedRan = false;
    let nestedMatched = false;
    // Reading `width` mid-tessellation triggers the inner call, so the two are genuinely interleaved
    // rather than merely sequential.
    const reentrantStyle = new Proxy(
      { ...OPEN_STYLE },
      {
        get(target, key) {
          if (key === 'width' && !nestedRan) {
            nestedRan = true;
            nestedMatched =
              JSON.stringify(tessellateStrokePath(makeClosedPath(), CLOSED_STYLE, 0.1)) === closedBaseline;
          }
          return (target as Record<string | symbol, unknown>)[key];
        },
      },
    ) as StrokeStyle;
    const outer = JSON.stringify(tessellateStrokePath(makeOpenPath(), reentrantStyle));
    expect(nestedRan).toBe(true);
    expect(nestedMatched).toBe(true);
    expect(outer).toBe(openBaseline);
  });

  it('does not mutate the path or style it is given', () => {
    const path = makeOpenPath();
    const style = { ...OPEN_STYLE };
    const pathBefore = JSON.stringify(path);
    const styleBefore = JSON.stringify(style);
    tessellateStrokePath(path, style);
    expect(JSON.stringify(path)).toBe(pathBefore);
    expect(JSON.stringify(style)).toBe(styleBefore);
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

// Fixtures for the sharing-contract probes: one open polyline and one closed ring, both chosen because
// they produce real geometry (12 and 80 vertices).
const OPEN_STYLE: StrokeStyle = { cap: 'butt', join: 'miter', width: 10 };
const CLOSED_STYLE: StrokeStyle = { join: 'round', width: 7 };

function makeOpenPath(): ReturnType<typeof createPath> {
  const path = createPath();
  appendPathMoveTo(path, 0, 0);
  appendPathLineTo(path, 100, 0);
  appendPathLineTo(path, 100, 100);
  return path;
}

function makeClosedPath(): ReturnType<typeof createPath> {
  const path = createPath();
  appendPathRectangle(path, 0, 0, 100, 50);
  return path;
}
