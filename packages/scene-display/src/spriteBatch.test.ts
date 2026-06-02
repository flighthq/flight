import type { Sprite, SpriteBatch } from '@flighthq/types';
import { SpriteBatchKind } from '@flighthq/types';

import {
  createSpriteBatch,
  createSpriteBatchData,
  createSpriteBatchRuntime,
  getSpriteBatchRuntime,
} from './spriteBatch';

describe('createSpriteBatch', () => {
  let spriteBatch: SpriteBatch;

  beforeEach(() => {
    spriteBatch = createSpriteBatch();
  });

  it('initializes default values', () => {
    expect(spriteBatch.data.graph).toBeNull();
    expect(spriteBatch.data.smoothing).toBe(true);
    expect(spriteBatch.kind).toStrictEqual(SpriteBatchKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      data: {
        graph: {} as Sprite,
        smoothing: false,
      },
    };
    const obj = createSpriteBatch(base);
    expect(obj.data.graph).toStrictEqual(base.data.graph);
    expect(obj.data.smoothing).toStrictEqual(base.data.smoothing);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createSpriteBatch(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createSpriteBatchData', () => {
  it('returns default values', () => {
    const data = createSpriteBatchData();
    expect(data.graph).toBeNull();
    expect(data.smoothing).toBe(true);
  });

  it('allows pre-defined values', () => {
    const data = createSpriteBatchData({ smoothing: false });
    expect(data.smoothing).toBe(false);
  });
});

describe('createSpriteBatchRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createSpriteBatchRuntime();
    expect(runtime).not.toBeNull();
  });
});

describe('getSpriteBatchRuntime', () => {
  it('returns the runtime for a SpriteBatch', () => {
    const batch = createSpriteBatch();
    const runtime = getSpriteBatchRuntime(batch);
    expect(runtime).not.toBeNull();
  });
});
