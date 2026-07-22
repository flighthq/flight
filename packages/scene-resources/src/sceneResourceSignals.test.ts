import { connectSignal, emitSignal } from '@flighthq/signals';
import type { ImageResourceReference, Texture } from '@flighthq/types';
import { EntityRuntimeKey, ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';
import {
  createSceneResourceSignals,
  enableSceneResourceSignals,
  getSceneResourceSignals,
} from './sceneResourceSignals';

const ref: ImageResourceReference = {
  bytes: new Uint8Array(),
  kind: ImageResourceReferenceKind.Embedded,
  mimeType: null,
  state: ResourceResolutionState.Resolved,
};

describe('createSceneResourceSignals', () => {
  it('creates a connectable, emittable signal group', () => {
    const signals = createSceneResourceSignals();
    expect(EntityRuntimeKey in signals).toBe(true);
    let received = 0;
    connectSignal(signals.onResourceResolved, () => received++);
    emitSignal(signals.onResourceResolved, { ref, texture: {} as Texture });
    expect(received).toBe(1);
  });
});

describe('enableSceneResourceSignals', () => {
  it('stores the group on the resolver and is idempotent', () => {
    const resolver = createSceneResourceResolver();
    const first = enableSceneResourceSignals(resolver);
    const second = enableSceneResourceSignals(resolver);
    expect(first).toBe(second);
    expect(getSceneResourceSignals(resolver)).toBe(first);
    disposeSceneResourceResolver(resolver);
  });
});

describe('getSceneResourceSignals', () => {
  it('returns null until enabled, then the enabled group', () => {
    const resolver = createSceneResourceResolver();
    expect(getSceneResourceSignals(resolver)).toBeNull();
    const signals = enableSceneResourceSignals(resolver);
    expect(getSceneResourceSignals(resolver)).toBe(signals);
    disposeSceneResourceResolver(resolver);
  });
});
