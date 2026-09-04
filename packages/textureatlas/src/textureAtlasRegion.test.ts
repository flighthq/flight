import { createRectangle, createVector2 } from '@flighthq/geometry/contract';
import { createTexture, getTextureSource, transformTextureUv } from '@flighthq/texture/contract';
import type { ImageResource, TextureAtlasRegion } from '@flighthq/types/contract';

import { createTextureAtlas } from './textureAtlas';
import {
  addTextureAtlasRegion,
  addTextureAtlasRegionCorners,
  addTextureAtlasRegionRectangle,
  addTextureAtlasRegionVector2,
  buildTextureAtlasRegionIndex,
  clearTextureAtlasRegions,
  createTextureAtlasRegion,
  explainTextureAtlasRegionTexture,
  getTextureAtlasRegionById,
  getTextureAtlasRegionByName,
  getTextureAtlasRegionByOrdinal,
  getTextureAtlasRegionCount,
  getTextureAtlasRegionFrame,
  getTextureAtlasRegionOrdinal,
  getTextureAtlasRegionSequence,
  getTextureAtlasRegionTexture,
  getTextureAtlasRegionUv,
  getTextureAtlasRegionUvQuad,
  hasTextureAtlasRegion,
  initializeTextureAtlasRegion,
  removeTextureAtlasRegion,
  setTextureAtlasRegion,
  setTextureAtlasRegionTextureGuard,
} from './textureAtlasRegion';

describe('addTextureAtlasRegion', () => {
  it('pushes a new region onto the atlas with the given coordinates', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 10, 20, 30, 40);
    expect(atlas.regions).toHaveLength(1);
    expect(atlas.regions[0].x).toBe(10);
    expect(atlas.regions[0].y).toBe(20);
    expect(atlas.regions[0].width).toBe(30);
    expect(atlas.regions[0].height).toBe(40);
  });

  it('assigns id equal to the region index before insertion', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    expect(atlas.regions[0].id).toBe(0);
    expect(atlas.regions[1].id).toBe(1);
  });

  it('sets optional pivot values', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, 5, 5);
    expect(atlas.regions[0].pivotX).toBe(5);
    expect(atlas.regions[0].pivotY).toBe(5);
  });

  it('sets optional name', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'hero');
    expect(atlas.regions[0].name).toBe('hero');
  });

  it('defaults name to null when not provided', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    expect(atlas.regions[0].name).toBeNull();
  });
});

describe('addTextureAtlasRegion id allocation', () => {
  // The regression this pins: the id was the region count, which is only the right answer while ids
  // happen to be a dense 0..n-1 run. An atlas built from parsed data (parsers assign their own ids)
  // or one that has had a region removed breaks that, and the new region then collides with an
  // existing id — getTextureAtlasRegionById silently returns the wrong frame and the new region is
  // unreachable by id.
  it('does not collide with an existing non-sequential id', () => {
    const atlas = createTextureAtlas({
      regions: [
        createTextureAtlasRegion({ height: 1, id: 5, name: 'a', width: 1, x: 0, y: 0 }),
        createTextureAtlasRegion({ height: 1, id: 2, name: 'b', width: 1, x: 1, y: 0 }),
      ],
    });
    addTextureAtlasRegion(atlas, 2, 0, 1, 1, undefined, undefined, 'c');
    const ids = atlas.regions.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getTextureAtlasRegionById(atlas, 2)?.name).toBe('b');
    expect(getTextureAtlasRegionByName(atlas, 'c')).not.toBeNull();
    expect(getTextureAtlasRegionById(atlas, getTextureAtlasRegionByName(atlas, 'c')!.id)?.name).toBe('c');
  });

  it('does not reuse a removed region id', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 1, 1, undefined, undefined, 'a');
    addTextureAtlasRegion(atlas, 1, 0, 1, 1, undefined, undefined, 'b');
    const removedId = getTextureAtlasRegionByName(atlas, 'b')!.id;
    removeTextureAtlasRegion(atlas, removedId);
    addTextureAtlasRegion(atlas, 2, 0, 1, 1, undefined, undefined, 'c');
    expect(getTextureAtlasRegionByName(atlas, 'c')!.id).not.toBe(removedId);
  });

  it('starts at 0 on an empty atlas and increments', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 1, 1);
    addTextureAtlasRegion(atlas, 1, 0, 1, 1);
    expect(atlas.regions.map((r) => r.id)).toEqual([0, 1]);
  });
});

describe('addTextureAtlasRegionCorners', () => {
  it('computes width and height from corner coordinates', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegionCorners(atlas, 5, 10, 25, 30);
    expect(atlas.regions[0].x).toBe(5);
    expect(atlas.regions[0].y).toBe(10);
    expect(atlas.regions[0].width).toBe(20);
    expect(atlas.regions[0].height).toBe(20);
  });

  it('sets optional name', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegionCorners(atlas, 0, 0, 10, 10, undefined, undefined, 'tile_0');
    expect(atlas.regions[0].name).toBe('tile_0');
  });
});

describe('addTextureAtlasRegionRectangle', () => {
  it('accepts rectangle-like and vector-like objects', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegionRectangle(atlas, { x: 10, y: 20, width: 30, height: 40 }, { x: 5, y: 6 });
    expect(atlas.regions[0].x).toBe(10);
    expect(atlas.regions[0].y).toBe(20);
    expect(atlas.regions[0].width).toBe(30);
    expect(atlas.regions[0].height).toBe(40);
    expect(atlas.regions[0].pivotX).toBe(5);
    expect(atlas.regions[0].pivotY).toBe(6);
  });

  it('adds a region from a Rectangle', () => {
    const atlas = createTextureAtlas();
    const rect = createRectangle(10, 20, 30, 40);
    addTextureAtlasRegionRectangle(atlas, rect);
    expect(atlas.regions[0].x).toBe(10);
    expect(atlas.regions[0].width).toBe(30);
  });

  it('sets optional name', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegionRectangle(atlas, createRectangle(0, 0, 10, 10), undefined, 'frame_00');
    expect(atlas.regions[0].name).toBe('frame_00');
  });

  it('sets pivot from optional Vector2', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegionRectangle(atlas, createRectangle(0, 0, 10, 10), createVector2(3, 4));
    expect(atlas.regions[0].pivotX).toBe(3);
    expect(atlas.regions[0].pivotY).toBe(4);
  });
});

describe('addTextureAtlasRegionVector2', () => {
  it('accepts vector-like corner and pivot objects', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegionVector2(atlas, { x: 5, y: 10 }, { x: 25, y: 30 }, { x: 3, y: 4 });
    expect(atlas.regions[0].x).toBe(5);
    expect(atlas.regions[0].y).toBe(10);
    expect(atlas.regions[0].width).toBe(20);
    expect(atlas.regions[0].height).toBe(20);
    expect(atlas.regions[0].pivotX).toBe(3);
    expect(atlas.regions[0].pivotY).toBe(4);
  });

  it('computes region from two Vector2 corner points', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegionVector2(atlas, createVector2(5, 10), createVector2(25, 30));
    expect(atlas.regions[0].x).toBe(5);
    expect(atlas.regions[0].y).toBe(10);
    expect(atlas.regions[0].width).toBe(20);
    expect(atlas.regions[0].height).toBe(20);
  });

  it('sets optional name', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegionVector2(atlas, { x: 0, y: 0 }, { x: 10, y: 10 }, undefined, 'walk_01');
    expect(atlas.regions[0].name).toBe('walk_01');
  });
});

describe('buildTextureAtlasRegionIndex', () => {
  it('maps every named region to itself', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 1, 1, undefined, undefined, 'a');
    addTextureAtlasRegion(atlas, 1, 0, 1, 1, undefined, undefined, 'b');
    const index = buildTextureAtlasRegionIndex(atlas);
    expect(index.size).toBe(2);
    expect(index.get('a')).toBe(getTextureAtlasRegionByName(atlas, 'a'));
    expect(index.get('b')).toBe(getTextureAtlasRegionByName(atlas, 'b'));
  });

  it('skips unnamed regions', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 1, 1);
    expect(buildTextureAtlasRegionIndex(atlas).size).toBe(0);
  });

  it('resolves a duplicate name the same way the linear scan does — first wins', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 1, 1, undefined, undefined, 'dup');
    addTextureAtlasRegion(atlas, 5, 5, 1, 1, undefined, undefined, 'dup');
    expect(buildTextureAtlasRegionIndex(atlas).get('dup')).toBe(getTextureAtlasRegionByName(atlas, 'dup'));
  });

  it('is a snapshot — a later add is not reflected', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 1, 1, undefined, undefined, 'a');
    const index = buildTextureAtlasRegionIndex(atlas);
    addTextureAtlasRegion(atlas, 1, 0, 1, 1, undefined, undefined, 'b');
    expect(index.has('b')).toBe(false);
  });
});

describe('clearTextureAtlasRegions', () => {
  it('empties the regions and leaves the atlas reusable', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 1, 1, undefined, undefined, 'a');
    clearTextureAtlasRegions(atlas);
    expect(getTextureAtlasRegionCount(atlas)).toBe(0);
    addTextureAtlasRegion(atlas, 0, 0, 1, 1, undefined, undefined, 'b');
    expect(getTextureAtlasRegionCount(atlas)).toBe(1);
  });

  it('is a no-op on an empty atlas', () => {
    const atlas = createTextureAtlas();
    expect(() => clearTextureAtlasRegions(atlas)).not.toThrow();
  });
});

describe('createTextureAtlasRegion', () => {
  let region: TextureAtlasRegion;

  beforeEach(() => {
    region = createTextureAtlasRegion();
  });

  it('allows pre-defined values', () => {
    const base = {
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      id: 5,
      name: 'hero',
      pivotX: 6,
      pivotY: 7,
    };
    const obj = createTextureAtlasRegion(base);
    expect(obj.x).toStrictEqual(base.x);
    expect(obj.y).toStrictEqual(base.y);
    expect(obj.width).toStrictEqual(base.width);
    expect(obj.height).toStrictEqual(base.height);
    expect(obj.id).toStrictEqual(base.id);
    expect(obj.name).toStrictEqual(base.name);
    expect(obj.pivotX).toStrictEqual(base.pivotX);
    expect(obj.pivotY).toStrictEqual(base.pivotY);
  });

  it('initializes default values', () => {
    expect(region.x).toStrictEqual(0);
    expect(region.y).toStrictEqual(0);
    expect(region.id).toStrictEqual(-1);
    expect(region.name).toBeNull();
    expect(region.originalHeight).toBeNull();
    expect(region.originalWidth).toBeNull();
    expect(region.pivotX).toBeNull();
    expect(region.pivotY).toBeNull();
    expect(region.rotated).toBe(false);
    expect(region.sourceX).toStrictEqual(0);
    expect(region.sourceY).toStrictEqual(0);
    expect(region.trimmed).toBe(false);
    expect(region.width).toStrictEqual(0);
    expect(region.height).toStrictEqual(0);
  });

  it('initializes trim and rotation fields', () => {
    const trimmed = createTextureAtlasRegion({
      trimmed: true,
      rotated: true,
      sourceX: 4,
      sourceY: 8,
      originalWidth: 64,
      originalHeight: 32,
    });
    expect(trimmed.trimmed).toBe(true);
    expect(trimmed.rotated).toBe(true);
    expect(trimmed.sourceX).toBe(4);
    expect(trimmed.sourceY).toBe(8);
    expect(trimmed.originalWidth).toBe(64);
    expect(trimmed.originalHeight).toBe(32);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createTextureAtlasRegion(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('explainTextureAtlasRegionTexture', () => {
  it('reports missing inputs, unsupported page rotation, and readiness', () => {
    const atlas = createTextureAtlas();
    expect(explainTextureAtlasRegionTexture(atlas, 0)).toEqual({ status: 'missing-region' });

    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    expect(explainTextureAtlasRegionTexture(atlas, 0)).toEqual({ status: 'missing-texture' });

    atlas.texture = createTexture({
      dimension: '2d',
      source: { height: 50, width: 100 } as ImageResource,
      uvRotation: 0.25,
    });
    expect(explainTextureAtlasRegionTexture(atlas, 0)).toEqual({ status: 'rotated-page' });

    atlas.texture.uvRotation = 0;
    expect(explainTextureAtlasRegionTexture(atlas, 0)).toEqual({ status: 'ready' });
  });
});

describe('getTextureAtlasRegionById', () => {
  it('returns null for an empty atlas', () => {
    const atlas = createTextureAtlas();
    expect(getTextureAtlasRegionById(atlas, 0)).toBeNull();
  });

  it('returns null when no region matches the id', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    expect(getTextureAtlasRegionById(atlas, 99)).toBeNull();
  });

  it('returns the region with the matching id', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    addTextureAtlasRegion(atlas, 10, 0, 10, 10);
    const region = getTextureAtlasRegionById(atlas, 1);
    expect(region).not.toBeNull();
    expect(region?.x).toBe(10);
    expect(region?.id).toBe(1);
  });
});

describe('getTextureAtlasRegionByName', () => {
  it('returns null for an empty atlas', () => {
    const atlas = createTextureAtlas();
    expect(getTextureAtlasRegionByName(atlas, 'hero')).toBeNull();
  });

  it('returns null when no region matches the name', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'hero');
    expect(getTextureAtlasRegionByName(atlas, 'villain')).toBeNull();
  });

  it('returns null for regions with null name', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    expect(getTextureAtlasRegionByName(atlas, '')).toBeNull();
  });

  it('returns the region with the matching name', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'hero_idle_0');
    addTextureAtlasRegion(atlas, 10, 0, 10, 10, undefined, undefined, 'hero_walk_0');
    const region = getTextureAtlasRegionByName(atlas, 'hero_walk_0');
    expect(region).not.toBeNull();
    expect(region?.x).toBe(10);
    expect(region?.name).toBe('hero_walk_0');
  });

  it('is case-sensitive', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'Hero');
    expect(getTextureAtlasRegionByName(atlas, 'hero')).toBeNull();
    expect(getTextureAtlasRegionByName(atlas, 'Hero')).not.toBeNull();
  });
});

describe('getTextureAtlasRegionByOrdinal', () => {
  it('returns the region carrying that frame number', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'walk_01');
    addTextureAtlasRegion(atlas, 10, 0, 10, 10, undefined, undefined, 'walk_02');
    expect(getTextureAtlasRegionByOrdinal(atlas, 'walk', 2)?.name).toBe('walk_02');
  });

  it('matches the ordinal as a number, so zero padding does not have to be known', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'walk_0007');
    expect(getTextureAtlasRegionByOrdinal(atlas, 'walk', 7)?.name).toBe('walk_0007');
  });

  it('returns null when no region carries that ordinal', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'walk_01');
    expect(getTextureAtlasRegionByOrdinal(atlas, 'walk', 9)).toBeNull();
  });

  it('does not match a region whose ordinal matches under a different prefix', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'idle_01');
    expect(getTextureAtlasRegionByOrdinal(atlas, 'walk', 1)).toBeNull();
  });

  it('skips unnamed regions rather than reading an ordinal off them', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    expect(getTextureAtlasRegionByOrdinal(atlas, '', -1)).toBeNull();
  });
});

describe('getTextureAtlasRegionCount', () => {
  it('counts the regions', () => {
    const atlas = createTextureAtlas();
    expect(getTextureAtlasRegionCount(atlas)).toBe(0);
    addTextureAtlasRegion(atlas, 0, 0, 1, 1);
    expect(getTextureAtlasRegionCount(atlas)).toBe(1);
  });
});

describe('getTextureAtlasRegionFrame', () => {
  it('reports the trim offset and the original extent for a trimmed region', () => {
    const region = createTextureAtlasRegion({
      height: 20,
      originalHeight: 64,
      originalWidth: 64,
      sourceX: 8,
      sourceY: 12,
      trimmed: true,
      width: 30,
      x: 100,
      y: 200,
    });
    const out = { height: 0, width: 0, x: 0, y: 0 };
    expect(getTextureAtlasRegionFrame(region, out)).toBe(out);
    expect(out).toEqual({ height: 64, width: 64, x: 8, y: 12 });
  });

  it('falls back to the packed extent for an untrimmed region, needing no caller special case', () => {
    const region = createTextureAtlasRegion({ height: 20, width: 30, x: 100, y: 200 });
    const out = { height: 0, width: 0, x: 0, y: 0 };
    getTextureAtlasRegionFrame(region, out);
    expect(out).toEqual({ height: 20, width: 30, x: 0, y: 0 });
  });
});

describe('getTextureAtlasRegionOrdinal', () => {
  it('reads the trailing frame number', () => {
    expect(getTextureAtlasRegionOrdinal(createTextureAtlasRegion({ name: 'walk_12' }))).toBe(12);
  });

  it('treats leading zeros as insignificant', () => {
    expect(getTextureAtlasRegionOrdinal(createTextureAtlasRegion({ name: 'walk_007' }))).toBe(7);
  });

  it('reads digits that are not separated from the base name', () => {
    expect(getTextureAtlasRegionOrdinal(createTextureAtlasRegion({ name: 'walk12' }))).toBe(12);
  });

  it('returns -1 when the name ends in a non-digit, rather than an interior number', () => {
    expect(getTextureAtlasRegionOrdinal(createTextureAtlasRegion({ name: 'walk_10a' }))).toBe(-1);
  });

  it('returns -1 for a name with no digits at all', () => {
    expect(getTextureAtlasRegionOrdinal(createTextureAtlasRegion({ name: 'walk' }))).toBe(-1);
  });

  it('returns -1 for an unnamed region', () => {
    expect(getTextureAtlasRegionOrdinal(createTextureAtlasRegion())).toBe(-1);
  });

  it('reads a name that is entirely digits', () => {
    expect(getTextureAtlasRegionOrdinal(createTextureAtlasRegion({ name: '10' }))).toBe(10);
  });
});

describe('getTextureAtlasRegionSequence', () => {
  it('leaves out empty when the atlas has no regions', () => {
    const atlas = createTextureAtlas();
    expect(getTextureAtlasRegionSequence(atlas, 'walk', [])).toEqual([]);
  });

  it('collects regions whose names start with the given prefix', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'walk_01');
    addTextureAtlasRegion(atlas, 10, 0, 10, 10, undefined, undefined, 'walk_02');
    addTextureAtlasRegion(atlas, 20, 0, 10, 10, undefined, undefined, 'idle_01');
    const seq = getTextureAtlasRegionSequence(atlas, 'walk', []);
    expect(seq.map((r) => r.name)).toEqual(['walk_01', 'walk_02']);
  });

  it('skips regions with null names', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    addTextureAtlasRegion(atlas, 10, 0, 10, 10, undefined, undefined, 'walk_01');
    const seq = getTextureAtlasRegionSequence(atlas, 'walk', []);
    expect(seq.map((r) => r.name)).toEqual(['walk_01']);
  });

  it('orders by frame number rather than by insertion order', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'run_03');
    addTextureAtlasRegion(atlas, 10, 0, 10, 10, undefined, undefined, 'run_01');
    addTextureAtlasRegion(atlas, 20, 0, 10, 10, undefined, undefined, 'run_02');
    const seq = getTextureAtlasRegionSequence(atlas, 'run', []);
    expect(seq.map((r) => r.name)).toEqual(['run_01', 'run_02', 'run_03']);
  });

  // The defect the ordinal sort exists for: unpadded names sort walk_10 ahead of walk_2 as text, so
  // both insertion order and name order can hand back an animation that plays out of sequence.
  it('orders unpadded frame numbers numerically, not as text', () => {
    const atlas = createTextureAtlas();
    for (const name of ['walk_1', 'walk_10', 'walk_2', 'walk_11']) {
      addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, name);
    }
    const seq = getTextureAtlasRegionSequence(atlas, 'walk', []);
    expect(seq.map((r) => r.name)).toEqual(['walk_1', 'walk_2', 'walk_10', 'walk_11']);
  });

  it('sorts a region with no frame number after the numbered run', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'run');
    addTextureAtlasRegion(atlas, 10, 0, 10, 10, undefined, undefined, 'run_02');
    addTextureAtlasRegion(atlas, 20, 0, 10, 10, undefined, undefined, 'run_01');
    const seq = getTextureAtlasRegionSequence(atlas, 'run', []);
    expect(seq.map((r) => r.name)).toEqual(['run_01', 'run_02', 'run']);
  });

  it('keeps insertion order among regions sharing an ordinal', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'runFast_01');
    addTextureAtlasRegion(atlas, 10, 0, 10, 10, undefined, undefined, 'runSlow_01');
    addTextureAtlasRegion(atlas, 20, 0, 10, 10, undefined, undefined, 'run_00');
    const seq = getTextureAtlasRegionSequence(atlas, 'run', []);
    expect(seq.map((r) => r.name)).toEqual(['run_00', 'runFast_01', 'runSlow_01']);
  });

  it('keeps insertion order among unnumbered regions', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'runB');
    addTextureAtlasRegion(atlas, 10, 0, 10, 10, undefined, undefined, 'runA');
    const seq = getTextureAtlasRegionSequence(atlas, 'run', []);
    expect(seq.map((r) => r.name)).toEqual(['runB', 'runA']);
  });

  it('leaves out empty when no region names match the prefix', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'idle_01');
    expect(getTextureAtlasRegionSequence(atlas, 'walk', [])).toEqual([]);
  });

  it('returns out itself, and resets it so one array can be reused across calls', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'walk_01');
    addTextureAtlasRegion(atlas, 10, 0, 10, 10, undefined, undefined, 'idle_01');
    const out: TextureAtlasRegion[] = [];
    expect(getTextureAtlasRegionSequence(atlas, 'walk', out)).toBe(out);
    expect(out.map((r) => r.name)).toEqual(['walk_01']);
    expect(getTextureAtlasRegionSequence(atlas, 'idle', out)).toBe(out);
    expect(out.map((r) => r.name)).toEqual(['idle_01']);
  });
});

describe('getTextureAtlasRegionTexture', () => {
  it('returns one cached texture per distinct region over the shared atlas image', () => {
    const image = { height: 50, width: 100 } as ImageResource;
    const atlas = createTextureAtlas({ texture: createTexture({ dimension: '2d', source: image }) });
    addTextureAtlasRegion(atlas, 10, 5, 20, 15);
    addTextureAtlasRegion(atlas, 30, 5, 20, 15);

    const first = getTextureAtlasRegionTexture(atlas, 0);
    const again = getTextureAtlasRegionTexture(atlas, 0);
    const second = getTextureAtlasRegionTexture(atlas, 1);

    expect(first).toBe(again);
    expect(second).not.toBe(first);
    expect(first === null ? null : getTextureSource(first)).toBe(image);
    expect(first?.uvOffset).toMatchObject({ x: 0.1, y: 0.1 });
    expect(first?.uvScale).toMatchObject({ x: 0.2, y: 0.3 });
  });

  // The cache is keyed by region object, so it cannot notice a field changing inside one. What keeps
  // it correct is that every call re-derives the window — pinned here because it is the contract, and
  // without a test it reads as an incidental refresh someone could optimize away into a stale UV.
  it('re-derives the window on every call, so an in-place region edit is picked up', () => {
    const image = { height: 50, width: 100 } as ImageResource;
    const atlas = createTextureAtlas({ texture: createTexture({ dimension: '2d', source: image }) });
    addTextureAtlasRegion(atlas, 10, 5, 20, 15);

    const before = getTextureAtlasRegionTexture(atlas, 0)!;
    expect(before.uvOffset).toMatchObject({ x: 0.1, y: 0.1 });

    setTextureAtlasRegion(getTextureAtlasRegionById(atlas, 0)!, { height: 25, id: 0, width: 40, x: 50, y: 25 });
    const after = getTextureAtlasRegionTexture(atlas, 0)!;

    expect(after).toBe(before);
    expect(after.uvOffset).toMatchObject({ x: 0.5, y: 0.5 });
    expect(after.uvScale).toMatchObject({ x: 0.4, y: 0.5 });
  });

  // The cost of sharing one Texture per region: the earlier reference is not a snapshot.
  it('rewrites a previously returned reference rather than minting a second view', () => {
    const image = { height: 50, width: 100 } as ImageResource;
    const atlas = createTextureAtlas({ texture: createTexture({ dimension: '2d', source: image }) });
    addTextureAtlasRegion(atlas, 10, 5, 20, 15);

    const held = getTextureAtlasRegionTexture(atlas, 0)!;
    setTextureAtlasRegion(getTextureAtlasRegionById(atlas, 0)!, { height: 25, id: 0, width: 40, x: 50, y: 25 });
    getTextureAtlasRegionTexture(atlas, 0);

    expect(held.uvOffset).toMatchObject({ x: 0.5, y: 0.5 });
  });

  it('returns null without an image or matching region', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    expect(getTextureAtlasRegionTexture(atlas, 0)).toBeNull();
    atlas.texture = createTexture({
      dimension: '2d',
      source: { height: 10, width: 10 } as ImageResource,
    });
    expect(getTextureAtlasRegionTexture(atlas, 99)).toBeNull();
  });

  it('composes a region in pixel space against a windowed page', () => {
    const image = { height: 100, width: 200 } as ImageResource;
    const atlas = createTextureAtlas({
      texture: createTexture({
        dimension: '2d',
        source: image,
        uvOffset: createVector2(0.25, 0.1),
        uvScale: createVector2(0.5, 0.8),
      }),
    });
    addTextureAtlasRegion(atlas, 10, 5, 20, 15);

    const texture = getTextureAtlasRegionTexture(atlas, 0);

    expect(texture?.uvOffset).toMatchObject({ x: 0.3, y: 0.15 });
    expect(texture?.uvScale).toMatchObject({ x: 0.1, y: 0.15 });
  });

  it('folds page flips and packed-region rotation into the minted view', () => {
    const image = { height: 50, width: 100 } as ImageResource;
    const atlas = createTextureAtlas({
      texture: createTexture({
        dimension: '2d',
        flipX: true,
        flipY: true,
        source: image,
      }),
    });
    atlas.regions.push(createTextureAtlasRegion({ height: 15, id: 0, rotated: true, width: 20, x: 10, y: 5 }));

    const texture = getTextureAtlasRegionTexture(atlas, 0)!;
    const topLeft = createVector2();
    const bottomRight = createVector2();
    transformTextureUv(topLeft, texture, 0, 0);
    transformTextureUv(bottomRight, texture, 1, 1);

    expect(texture.flipX).toBe(true);
    expect(texture.flipY).toBe(true);
    expect(texture.uvRotation).toBeCloseTo(-Math.PI / 2);
    expect(topLeft.x).toBeCloseTo(0.9);
    expect(topLeft.y).toBeCloseTo(0.6);
    expect(bottomRight.x).toBeCloseTo(0.7);
    expect(bottomRight.y).toBeCloseTo(0.9);
  });

  it('refuses a rotated page', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    atlas.texture = createTexture({
      dimension: '2d',
      source: { height: 50, width: 100 } as ImageResource,
      uvRotation: 0.25,
    });
    expect(getTextureAtlasRegionTexture(atlas, 0)).toBeNull();

    atlas.texture.uvRotation = 0;
    expect(getTextureAtlasRegionTexture(atlas, 0)).not.toBeNull();
  });
});

describe('getTextureAtlasRegionUv', () => {
  it('returns zero rect when imageWidth is zero', () => {
    const region = createTextureAtlasRegion({ x: 10, y: 20, width: 30, height: 40 });
    const out = { x: 1, y: 1, width: 1, height: 1 };
    getTextureAtlasRegionUv(region, 0, 100, out);
    expect(out).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('returns zero rect when imageHeight is zero', () => {
    const region = createTextureAtlasRegion({ x: 10, y: 20, width: 30, height: 40 });
    const out = { x: 1, y: 1, width: 1, height: 1 };
    getTextureAtlasRegionUv(region, 100, 0, out);
    expect(out).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('computes normalized UV coordinates', () => {
    const region = createTextureAtlasRegion({ x: 0, y: 0, width: 128, height: 64 });
    const out = { x: 0, y: 0, width: 0, height: 0 };
    getTextureAtlasRegionUv(region, 256, 256, out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBeCloseTo(0.5);
    expect(out.height).toBeCloseTo(0.25);
  });

  it('computes UVs for a region offset within the atlas', () => {
    const region = createTextureAtlasRegion({ x: 128, y: 64, width: 64, height: 64 });
    const out = { x: 0, y: 0, width: 0, height: 0 };
    getTextureAtlasRegionUv(region, 256, 256, out);
    expect(out.x).toBeCloseTo(0.5);
    expect(out.y).toBeCloseTo(0.25);
    expect(out.width).toBeCloseTo(0.25);
    expect(out.height).toBeCloseTo(0.25);
  });

  it('is alias-safe when out shares no fields with region', () => {
    const region = createTextureAtlasRegion({ x: 64, y: 64, width: 64, height: 64 });
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const result = getTextureAtlasRegionUv(region, 256, 256, out);
    expect(result).toBe(out);
    expect(out.x).toBeCloseTo(0.25);
    expect(out.y).toBeCloseTo(0.25);
    expect(out.width).toBeCloseTo(0.25);
    expect(out.height).toBeCloseTo(0.25);
  });
});

describe('getTextureAtlasRegionUvQuad', () => {
  it('walks an unrotated region top-left, top-right, bottom-right, bottom-left', () => {
    const region = createTextureAtlasRegion({ height: 25, width: 50, x: 0, y: 0 });
    const out: number[] = [];
    expect(getTextureAtlasRegionUvQuad(region, 100, 100, out)).toBe(out);
    expect(out).toEqual([0, 0, 0.5, 0, 0.5, 0.25, 0, 0.25]);
  });

  it('steps a rotated region one corner back, so it draws upright', () => {
    const region = createTextureAtlasRegion({ height: 25, rotated: true, width: 50, x: 0, y: 0 });
    const out: number[] = [];
    getTextureAtlasRegionUvQuad(region, 100, 100, out);
    expect(out).toEqual([0, 0.25, 0, 0, 0.5, 0, 0.5, 0.25]);
  });

  it('covers the same four corners either way, only in a different order', () => {
    const packed = { height: 25, width: 50, x: 10, y: 20 };
    const upright: number[] = [];
    const rotated: number[] = [];
    getTextureAtlasRegionUvQuad(createTextureAtlasRegion(packed), 100, 100, upright);
    getTextureAtlasRegionUvQuad(createTextureAtlasRegion({ ...packed, rotated: true }), 100, 100, rotated);
    const asPairs = (a: readonly number[]) =>
      a.reduce<string[]>((acc, _v, i) => (i % 2 ? acc : [...acc, `${a[i]},${a[i + 1]}`]), []).sort();
    expect(asPairs(rotated)).toEqual(asPairs(upright));
  });

  it('writes eight zeros for a zero-sized image rather than dividing by zero', () => {
    const region = createTextureAtlasRegion({ height: 25, width: 50, x: 0, y: 0 });
    const out: number[] = [1, 2, 3];
    getTextureAtlasRegionUvQuad(region, 0, 100, out);
    expect(out).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('agrees with getTextureAtlasRegionUv on the unrotated packed rect', () => {
    const region = createTextureAtlasRegion({ height: 25, width: 50, x: 10, y: 20 });
    const rect = { height: 0, width: 0, x: 0, y: 0 };
    getTextureAtlasRegionUv(region, 100, 100, rect);
    const quad: number[] = [];
    getTextureAtlasRegionUvQuad(region, 100, 100, quad);
    expect(quad[0]).toBeCloseTo(rect.x);
    expect(quad[1]).toBeCloseTo(rect.y);
    expect(quad[4]).toBeCloseTo(rect.x + rect.width);
    expect(quad[5]).toBeCloseTo(rect.y + rect.height);
  });
});

describe('hasTextureAtlasRegion', () => {
  it('is true for a present name and false otherwise, case-sensitively', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 1, 1, undefined, undefined, 'Hero');
    expect(hasTextureAtlasRegion(atlas, 'Hero')).toBe(true);
    expect(hasTextureAtlasRegion(atlas, 'hero')).toBe(false);
    expect(hasTextureAtlasRegion(atlas, 'missing')).toBe(false);
  });
});

describe('initializeTextureAtlasRegion', () => {
  it('is the construction initializer of createTextureAtlasRegion', () => {
    expect(typeof initializeTextureAtlasRegion).toBe('function');
  });
});

describe('removeTextureAtlasRegion', () => {
  it('removes the region and reports it', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 1, 1, undefined, undefined, 'a');
    const id = getTextureAtlasRegionByName(atlas, 'a')!.id;
    expect(removeTextureAtlasRegion(atlas, id)).toBe(true);
    expect(getTextureAtlasRegionById(atlas, id)).toBeNull();
    expect(getTextureAtlasRegionCount(atlas)).toBe(0);
  });

  it('reports false for an id no region holds', () => {
    const atlas = createTextureAtlas();
    expect(removeTextureAtlasRegion(atlas, 99)).toBe(false);
  });

  it('leaves the remaining regions findable by their original ids', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 1, 1, undefined, undefined, 'a');
    addTextureAtlasRegion(atlas, 1, 0, 1, 1, undefined, undefined, 'b');
    addTextureAtlasRegion(atlas, 2, 0, 1, 1, undefined, undefined, 'c');
    const idC = getTextureAtlasRegionByName(atlas, 'c')!.id;
    removeTextureAtlasRegion(atlas, getTextureAtlasRegionByName(atlas, 'a')!.id);
    expect(getTextureAtlasRegionById(atlas, idC)?.name).toBe('c');
  });
});

describe('setTextureAtlasRegion', () => {
  // These replace a block whose own title claimed "sets all fields on an existing region" while
  // asserting six of fourteen. The eight it did not assert were the eight the implementation did not
  // write — so the test agreed with the bug and named it correctly at the same time.
  it('overwrites every field, leaving nothing from the region it previously described', () => {
    const region = createTextureAtlasRegion({
      height: 40,
      id: 7,
      name: 'hero',
      originalHeight: 200,
      originalWidth: 100,
      pivotX: 0.5,
      pivotY: 0.5,
      rotated: true,
      sourceX: 5,
      sourceY: 6,
      trimmed: true,
      width: 30,
      x: 10,
      y: 20,
    });
    setTextureAtlasRegion(region, { height: 4, width: 3, x: 1, y: 2 });
    expect(region.x).toBe(1);
    expect(region.y).toBe(2);
    expect(region.width).toBe(3);
    expect(region.height).toBe(4);
    // The eight that used to survive from the previous frame.
    expect(region.id).toBe(-1);
    expect(region.name).toBeNull();
    expect(region.rotated).toBe(false);
    expect(region.trimmed).toBe(false);
    expect(region.sourceX).toBe(0);
    expect(region.sourceY).toBe(0);
    expect(region.originalWidth).toBeNull();
    expect(region.originalHeight).toBeNull();
  });

  it('lands exactly where createTextureAtlasRegion would for the same source', () => {
    const source = { name: 'frame', rotated: true, sourceX: 3, trimmed: true, height: 4, width: 3, x: 1, y: 2 };
    const built = createTextureAtlasRegion(source);
    const set = createTextureAtlasRegion({ name: 'stale', rotated: false, width: 99, x: 99 });
    setTextureAtlasRegion(set, source);
    for (const key of [
      'height',
      'id',
      'name',
      'originalHeight',
      'originalWidth',
      'pivotX',
      'pivotY',
      'rotated',
      'sourceX',
      'sourceY',
      'trimmed',
      'width',
      'x',
      'y',
    ] as const) {
      expect(set[key]).toBe(built[key]);
    }
  });

  it('round-trips an unset pivot as null, like the constructor', () => {
    const region = createTextureAtlasRegion({ pivotX: 0.5, pivotY: 0.5 });
    setTextureAtlasRegion(region, { height: 1, width: 1, x: 0, y: 0 });
    expect(region.pivotX).toBeNull();
    expect(region.pivotY).toBeNull();
  });

  it('carries an explicit pivot through', () => {
    const region = createTextureAtlasRegion();
    setTextureAtlasRegion(region, { height: 40, pivotX: 5, pivotY: 6, width: 30, x: 10, y: 20 });
    expect(region.pivotX).toBe(5);
    expect(region.pivotY).toBe(6);
  });

  it('reuses the existing region object rather than replacing it', () => {
    const region = createTextureAtlasRegion();
    const target = region;
    setTextureAtlasRegion(region, { height: 40, width: 30, x: 10, y: 20 });
    expect(region).toBe(target);
  });

  it('is alias-safe when the source is the region itself', () => {
    const region = createTextureAtlasRegion({
      height: 40,
      name: 'keep',
      rotated: true,
      sourceX: 7,
      width: 30,
      x: 10,
      y: 20,
    });
    setTextureAtlasRegion(region, region);
    expect(region.x).toBe(10);
    expect(region.y).toBe(20);
    expect(region.width).toBe(30);
    expect(region.height).toBe(40);
    expect(region.name).toBe('keep');
    expect(region.rotated).toBe(true);
    expect(region.sourceX).toBe(7);
  });
});
describe('setTextureAtlasRegionTextureGuard', () => {
  it('installs and removes the null-result diagnostics hook', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    const guard = vi.fn();
    setTextureAtlasRegionTextureGuard(guard);
    try {
      expect(getTextureAtlasRegionTexture(atlas, 0)).toBeNull();
      expect(guard).toHaveBeenCalledWith(atlas, 0, { status: 'missing-texture' });

      setTextureAtlasRegionTextureGuard(null);
      expect(getTextureAtlasRegionTexture(atlas, 0)).toBeNull();
      expect(guard).toHaveBeenCalledTimes(1);
    } finally {
      setTextureAtlasRegionTextureGuard(null);
    }
  });
});
