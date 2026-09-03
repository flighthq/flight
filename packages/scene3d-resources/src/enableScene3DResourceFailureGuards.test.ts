import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { emitSignal } from '@flighthq/signals/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { HasGraphicsImage, ImageResourceReference } from '@flighthq/types/contract';
import {
  EntityRuntimeKey,
  ImageResourceFailureKind,
  ImageResourceReferenceKind,
  LogLevel,
  ResourceResolutionState,
} from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import {
  areScene3DResourceFailureGuardsEnabled,
  disableScene3DResourceFailureGuards,
  enableScene3DResourceFailureGuards,
} from './enableScene3DResourceFailureGuards';
import { createScene3DResourceResolver, disposeScene3DResourceResolver } from './sceneResourceResolver';
import { enableScene3DResourceSignals } from './sceneResourceSignals';

const host: HasGraphicsImage = {
  graphics: { image: { [EntityRuntimeKey]: undefined, loadImageFromUrl: vi.fn() } },
} as HasGraphicsImage;
const sinks: ReturnType<typeof createMemoryLogSink>[] = [];

afterEach(() => {
  for (const sink of sinks) removeLogSink(sink.sink);
  sinks.length = 0;
});

function failedRef(): ImageResourceReference {
  return {
    [EntityRuntimeKey]: undefined,
    basePath: null,
    failure: {
      [EntityRuntimeKey]: undefined,
      kind: ImageResourceFailureKind.Error,
      message: 'bad image',
      name: 'CodecError',
    },
    kind: ImageResourceReferenceKind.External,
    mimeType: null,
    state: ResourceResolutionState.Failed,
    uri: 'bad.png',
  };
}

describe('areScene3DResourceFailureGuardsEnabled', () => {
  it('tracks resolver-scoped enable and disable state', () => {
    const resolver = createScene3DResourceResolver(host);
    expect(areScene3DResourceFailureGuardsEnabled(resolver)).toBe(false);
    enableScene3DResourceFailureGuards(resolver);
    expect(areScene3DResourceFailureGuardsEnabled(resolver)).toBe(true);
    disableScene3DResourceFailureGuards(resolver);
    expect(areScene3DResourceFailureGuardsEnabled(resolver)).toBe(false);
    disposeScene3DResourceResolver(resolver);
  });
});

describe('disableScene3DResourceFailureGuards', () => {
  it('is harmless when the guard is absent', () => {
    const resolver = createScene3DResourceResolver(host);
    expect(() => disableScene3DResourceFailureGuards(resolver)).not.toThrow();
    disposeScene3DResourceResolver(resolver);
  });
});

describe('enableScene3DResourceFailureGuards', () => {
  it('warns once per failed attempt, names recovery, and does not change resolver settlement', () => {
    const sink = createMemoryLogSink(4);
    sinks.push(sink);
    addLogSink(sink.sink);
    const resolver = createScene3DResourceResolver(host);
    const signals = enableScene3DResourceSignals(resolver);
    const ref = failedRef();
    const texture = createTexture({ resource: ref });
    const dispose = enableScene3DResourceFailureGuards(resolver);
    const event = { ref, texture };

    expect(() => emitSignal(signals.onResourceFailed, event)).not.toThrow();
    emitSignal(signals.onResourceFailed, event);
    const entries = getMemoryLogSinkEntries(sink);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ channel: 'scene-resources', level: LogLevel.Warn });
    expect(entries[0]?.data).toMatchObject({
      failureKind: ImageResourceFailureKind.Error,
      failureMessage: 'bad image',
      failureName: 'CodecError',
      message: 'Scene3D resource acquisition failed — call retryFailedScene3DResources to request it again',
    });
    expect(ref.state).toBe(ResourceResolutionState.Failed);

    emitSignal(signals.onResourceResolved, event);
    ref.failure = {
      [EntityRuntimeKey]: undefined,
      kind: ImageResourceFailureKind.Unavailable,
      message: 'still unavailable',
      name: null,
    };
    emitSignal(signals.onResourceFailed, event);
    expect(getMemoryLogSinkEntries(sink)).toHaveLength(2);
    dispose();
    emitSignal(signals.onResourceResolved, event);
    emitSignal(signals.onResourceFailed, event);
    expect(getMemoryLogSinkEntries(sink)).toHaveLength(2);
    disposeScene3DResourceResolver(resolver);
  });

  it('is idempotent for one resolver', () => {
    const sink = createMemoryLogSink(4);
    sinks.push(sink);
    addLogSink(sink.sink);
    const resolver = createScene3DResourceResolver(host);
    const signals = enableScene3DResourceSignals(resolver);
    const ref = failedRef();
    const texture = createTexture({ resource: ref });
    const firstDispose = enableScene3DResourceFailureGuards(resolver);
    const secondDispose = enableScene3DResourceFailureGuards(resolver);

    emitSignal(signals.onResourceFailed, { ref, texture });
    expect(getMemoryLogSinkEntries(sink)).toHaveLength(1);
    secondDispose();
    expect(areScene3DResourceFailureGuardsEnabled(resolver)).toBe(false);
    firstDispose();
    disposeScene3DResourceResolver(resolver);
  });
});
