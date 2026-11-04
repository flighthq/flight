// Generated from crates/flight-clip/tests/clip_region_shapes_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createRectangle } from '@flighthq/geometry/contract';
import { appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import {
  createClipRegionFromCircle,
  createClipRegionFromEllipse,
  createClipRegionFromPath,
  createClipRegionFromRectangle,
  createClipRegionFromRoundedRectangle,
  initializeClipRegionFromPath,
} from './contract.ts';

describe('createClipRegionFromCircle', () => {
  it('preserves circle bounds', () => {
    const clip = createClipRegionFromCircle(5.0, 6.0, 2.0, undefined);
    expect(clip!.rect).toEqual(createRectangle(3.0, 4.0, 4.0, 4.0));
  });
});

describe('createClipRegionFromEllipse', () => {
  it('preserves ellipse bounds', () => {
    const rectangle = createRectangle(1.0, 2.0, 6.0, 4.0);
    const clip = createClipRegionFromEllipse(rectangle, undefined);
    expect(clip!.rect).toEqual(rectangle);
  });
});

describe('createClipRegionFromPath', () => {
  it('preserves path winding', () => {
    let path = createPath('evenOdd');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 2.0, 0.0);
    appendPathLineTo(path, 1.0, 2.0);
    const clip = createClipRegionFromPath(path, undefined);
    expect(clip!.winding).toEqual('evenOdd');
  });
});

describe('createClipRegionFromRoundedRectangle', () => {
  it('uses rect form for zero radius', () => {
    const clip = createClipRegionFromRoundedRectangle(createRectangle(1.0, 2.0, 3.0, 4.0), 0.0, undefined);
    expect(clip!.contours).toEqual(null);
  });
});

describe('initializeClipRegionFromPath', () => {
  it('initializes existing storage', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 2.0, 0.0);
    appendPathLineTo(path, 1.0, 2.0);
    const clip = createClipRegionFromRectangle(createRectangle(0.0, 0.0, 0.0, 0.0));
    initializeClipRegionFromPath(clip!, path, undefined);
    expect(clip!.rect).toEqual(createRectangle(0.0, 0.0, 2.0, 2.0));
  });
});
