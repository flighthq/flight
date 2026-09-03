import { connectSignal, emitSignal } from '@flighthq/signals/contract';
import type { ImageResourceReference, Texture } from '@flighthq/types/contract';
import { EntityRuntimeKey, ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createScene3DResourceResolver, disposeScene3DResourceResolver } from './sceneResourceResolver';
import {
  createScene3DResourceSignals,
  enableScene3DResourceSignals,
  getScene3DResourceSignals,
} from './sceneResourceSignals';

const ref: ImageResourceReference = {
  [EntityRuntimeKey]: undefined,
  alphaType: 'straight',
  bytes: new Uint8Array(),
  failure: null,
  kind: ImageResourceReferenceKind.Embedded,
  mimeType: null,
  state: ResourceResolutionState.Resolved,
};

describe('createScene3DResourceSignals', () => {
  it('creates a connectable, emittable signal group', () => {
    const signals = createScene3DResourceSignals();
    expect(EntityRuntimeKey in signals).toBe(true);
    let received = 0;
    connectSignal(signals.onResourceResolved, () => received++);
    emitSignal(signals.onResourceResolved, { ref, texture: {} as Texture });
    expect(received).toBe(1);
  });
});

describe('enableScene3DResourceSignals', () => {
  it('stores the group on the resolver and is idempotent', () => {
    const resolver = createScene3DResourceResolver();
    const first = enableScene3DResourceSignals(resolver);
    const second = enableScene3DResourceSignals(resolver);
    expect(first).toBe(second);
    expect(getScene3DResourceSignals(resolver)).toBe(first);
    disposeScene3DResourceResolver(resolver);
  });
});

describe('getScene3DResourceSignals', () => {
  it('returns null until enabled, then the enabled group', () => {
    const resolver = createScene3DResourceResolver();
    expect(getScene3DResourceSignals(resolver)).toBeNull();
    const signals = enableScene3DResourceSignals(resolver);
    expect(getScene3DResourceSignals(resolver)).toBe(signals);
    disposeScene3DResourceResolver(resolver);
  });
});
