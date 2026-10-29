// Generated from crates/flight-path/tests/tessellate_stroke_path_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  appendPathClose,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathRectangle,
  createPath,
  tessellateStrokePath,
} from './contract.ts';
import type { PathMesh, PathRaw, StrokeStyle } from './contract.ts';

function meshArea(mesh: Readonly<PathMesh>): number {
  let area = 0.0;
  let i = 0;
  while (i < mesh.indices.length) {
    const a = (mesh.indices[i] >>> 0) * 2;
    const b = (mesh.indices[i + 1] >>> 0) * 2;
    const c = (mesh.indices[i + 2] >>> 0) * 2;
    area +=
      Math.abs(
        (mesh.vertices[b] - mesh.vertices[a]) * (mesh.vertices[c + 1] - mesh.vertices[a + 1]) -
          (mesh.vertices[b + 1] - mesh.vertices[a + 1]) * (mesh.vertices[c] - mesh.vertices[a]),
      ) / 2.0;
    i += 3;
  }
  return area;
}

function bowTie(): PathRaw {
  let path = createPath('nonZero');
  appendPathMoveTo(path, 0.0, 0.0);
  appendPathLineTo(path, 40.0, 40.0);
  appendPathLineTo(path, 0.0, 40.0);
  appendPathLineTo(path, 40.0, 0.0);
  appendPathClose(path);
  return path;
}

describe('tessellateStrokePath', () => {
  it('tessellates open butt capped line without overlapping triangles', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.cap = 'butt';
    style.width = 10.0;
    const mesh = tessellateStrokePath(path, style, 0.25)!;
    expect(mesh.indices.length).toEqual(6);
    expect(Math.abs(meshArea(mesh) - 1000.0) < 5e-7).toBe(true);
  });
  it('tessellates closed rectangle as hollow ring', () => {
    let path = createPath('nonZero');
    appendPathRectangle(path, 0.0, 0.0, 100.0, 50.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.join = 'miter';
    style.width = 10.0;
    const mesh = tessellateStrokePath(path, style, 0.25)!;
    expect(Math.abs(meshArea(mesh) - 3000.0) < 5e-7).toBe(true);
  });
  it('uses same round join sampling tolerance as stroke outlines', () => {
    let path = createPath('nonZero');
    appendPathRectangle(path, 0.0, 0.0, 100.0, 50.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.join = 'round';
    style.width = 10.0;
    const fine = tessellateStrokePath(path, style, 0.1)!;
    const coarse = tessellateStrokePath(path, style, 5.0)!;
    expect(fine.vertices.length > coarse.vertices.length).toBe(true);
  });
  it('turns dashed closed path into independently capped stroke pieces', () => {
    let path = createPath('nonZero');
    appendPathRectangle(path, 0.0, 0.0, 100.0, 50.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.cap = 'round';
    style.dash = [20.0, 10.0];
    style.width = 6.0;
    const mesh = tessellateStrokePath(path, style, 0.25)!;
    expect(mesh.indices.length > 6).toBe(true);
  });
  it('returns none for self intersecting centerline', () => {
    const path = bowTie();
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = 8.0;
    expect(tessellateStrokePath(path, style, 0.25) === null).toBe(true);
  });
  it('returns none for zero width', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 10.0, 0.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = 0.0;
    expect(tessellateStrokePath(path, style, 0.25) === null).toBe(true);
  });
  it('returns none for nan width', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 10.0, 0.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = Number.NaN;
    expect(tessellateStrokePath(path, style, 0.25) === null).toBe(true);
  });
  it('returns nonempty mesh for open and closed paths', () => {
    let openPath = createPath('nonZero');
    appendPathMoveTo(openPath, 0.0, 0.0);
    appendPathLineTo(openPath, 100.0, 0.0);
    appendPathLineTo(openPath, 100.0, 100.0);
    let openStyle: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    openStyle.cap = 'butt';
    openStyle.join = 'miter';
    openStyle.width = 10.0;
    const openMesh = tessellateStrokePath(openPath, openStyle, 0.25)!;
    expect(openMesh.vertices.length > 0).toBe(true);
    let closedPath = createPath('nonZero');
    appendPathRectangle(closedPath, 0.0, 0.0, 100.0, 50.0);
    let closedStyle: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    closedStyle.join = 'round';
    closedStyle.width = 7.0;
    const closedMesh = tessellateStrokePath(closedPath, closedStyle, 0.1)!;
    expect(closedMesh.vertices.length > 0).toBe(true);
  });
  it('returns none for empty path', () => {
    const path = createPath('nonZero');
    const style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    } as const;
    expect(tessellateStrokePath(path, style, 0.25) === null).toBe(true);
  });
  it('returns identical geometry when calls for two paths are interleaved', () => {
    let openPath = createPath('nonZero');
    appendPathMoveTo(openPath, 0.0, 0.0);
    appendPathLineTo(openPath, 100.0, 0.0);
    appendPathLineTo(openPath, 100.0, 100.0);
    const openStyle: StrokeStyle = {
      width: 10.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    } as const;
    let closedPath = createPath('nonZero');
    appendPathRectangle(closedPath, 0.0, 0.0, 100.0, 50.0);
    const closedStyle: StrokeStyle = {
      width: 7.0,
      cap: 'butt',
      join: 'round',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    } as const;
    const openBaseline = tessellateStrokePath(openPath, openStyle, 0.25)!;
    const closedBaseline = tessellateStrokePath(closedPath, closedStyle, 0.1)!;
    for (let _ = 0; _ < 50; _ += 1) {
      const open = tessellateStrokePath(openPath, openStyle, 0.25)!;
      expect(open.vertices).toEqual(openBaseline.vertices);
      expect(open.indices).toEqual(openBaseline.indices);
      const closed = tessellateStrokePath(closedPath, closedStyle, 0.1)!;
      expect(closed.vertices).toEqual(closedBaseline.vertices);
      expect(closed.indices).toEqual(closedBaseline.indices);
    }
  });
  it('does not mutate the path or style', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    appendPathLineTo(path, 100.0, 100.0);
    const commandsBefore = path.commands.slice();
    const dataBefore = path.data.slice();
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.cap = 'butt';
    style.join = 'miter';
    style.width = 10.0;
    const widthBefore = style.width;
    tessellateStrokePath(path, style, 0.25);
    expect(path.commands).toEqual(commandsBefore);
    expect(path.data).toEqual(dataBefore);
    expect(style.width).toEqual(widthBefore);
  });
  it('normalizes an explicit close and a return to start centerline to the same ring', () => {
    let closed = createPath('nonZero');
    appendPathRectangle(closed, 0.0, 0.0, 100.0, 50.0);
    let returned = createPath('nonZero');
    appendPathMoveTo(returned, 0.0, 0.0);
    appendPathLineTo(returned, 100.0, 0.0);
    appendPathLineTo(returned, 100.0, 50.0);
    appendPathLineTo(returned, 0.0, 50.0);
    appendPathLineTo(returned, 0.0, 0.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = 10.0;
    const meshClosed = tessellateStrokePath(closed, style, 0.25)!;
    const meshReturned = tessellateStrokePath(returned, style, 0.25)!;
    expect(meshClosed.vertices.length > 0).toBe(true);
    expect(meshClosed.vertices).toEqual(meshReturned.vertices);
    expect(meshClosed.indices).toEqual(meshReturned.indices);
  });
  it('returns none for invalid style', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = -1.0;
    expect(tessellateStrokePath(path, style, 0.25) === null).toBe(true);
  });
});
