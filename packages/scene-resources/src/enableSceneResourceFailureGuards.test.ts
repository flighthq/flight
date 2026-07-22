import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log';
import { emitSignal } from '@flighthq/signals';
import { createTexture } from '@flighthq/texture';
import type { ImageResourceReference } from '@flighthq/types';
import {
  ImageResourceFailureKind,
  ImageResourceReferenceKind,
  LogLevel,
  ResourceResolutionState,
} from '@flighthq/types';
import { afterEach, describe, expect, it } from 'vitest';

import {
  areSceneResourceFailureGuardsEnabled,
  disableSceneResourceFailureGuards,
  enableSceneResourceFailureGuards,
} from './enableSceneResourceFailureGuards';
import { createSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';
import { enableSceneResourceSignals } from './sceneResourceSignals';

const sinks: ReturnType<typeof createMemoryLogSink>[] = [];

afterEach(() => {
  for (const sink of sinks) removeLogSink(sink.sink);
  sinks.length = 0;
});

function failedRef(): ImageResourceReference {
  return {
    basePath: null,
    failure: { kind: ImageResourceFailureKind.Error, message: 'bad image', name: 'CodecError' },
    kind: ImageResourceReferenceKind.External,
    mimeType: null,
    state: ResourceResolutionState.Failed,
    uri: 'bad.png',
  };
}

describe('areSceneResourceFailureGuardsEnabled', () => {
  it('tracks resolver-scoped enable and disable state', () => {
    const resolver = createSceneResourceResolver();
    expect(areSceneResourceFailureGuardsEnabled(resolver)).toBe(false);
    enableSceneResourceFailureGuards(resolver);
    expect(areSceneResourceFailureGuardsEnabled(resolver)).toBe(true);
    disableSceneResourceFailureGuards(resolver);
    expect(areSceneResourceFailureGuardsEnabled(resolver)).toBe(false);
    disposeSceneResourceResolver(resolver);
  });
});

describe('disableSceneResourceFailureGuards', () => {
  it('is harmless when the guard is absent', () => {
    const resolver = createSceneResourceResolver();
    expect(() => disableSceneResourceFailureGuards(resolver)).not.toThrow();
    disposeSceneResourceResolver(resolver);
  });
});

describe('enableSceneResourceFailureGuards', () => {
  it('warns once per failed attempt, names recovery, and does not change resolver settlement', () => {
    const sink = createMemoryLogSink(4);
    sinks.push(sink);
    addLogSink(sink.sink);
    const resolver = createSceneResourceResolver();
    const signals = enableSceneResourceSignals(resolver);
    const texture = createTexture({ resource: failedRef() });
    const dispose = enableSceneResourceFailureGuards(resolver);
    const event = { ref: texture.resource!, texture };

    expect(() => emitSignal(signals.onResourceFailed, event)).not.toThrow();
    emitSignal(signals.onResourceFailed, event);
    const entries = getMemoryLogSinkEntries(sink);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ channel: 'scene-resources', level: LogLevel.Warn });
    expect(entries[0]?.data).toMatchObject({
      failureKind: ImageResourceFailureKind.Error,
      failureMessage: 'bad image',
      failureName: 'CodecError',
      message:
        'resolveSceneResources: image resource resolution failed — call retryFailedSceneResources to request it again',
    });
    expect(texture.resource?.state).toBe(ResourceResolutionState.Failed);

    emitSignal(signals.onResourceResolved, event);
    texture.resource!.failure = {
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
    disposeSceneResourceResolver(resolver);
  });

  it('is idempotent for one resolver', () => {
    const sink = createMemoryLogSink(4);
    sinks.push(sink);
    addLogSink(sink.sink);
    const resolver = createSceneResourceResolver();
    const signals = enableSceneResourceSignals(resolver);
    const texture = createTexture({ resource: failedRef() });
    const firstDispose = enableSceneResourceFailureGuards(resolver);
    const secondDispose = enableSceneResourceFailureGuards(resolver);

    emitSignal(signals.onResourceFailed, { ref: texture.resource!, texture });
    expect(getMemoryLogSinkEntries(sink)).toHaveLength(1);
    secondDispose();
    expect(areSceneResourceFailureGuardsEnabled(resolver)).toBe(false);
    firstDispose();
    disposeSceneResourceResolver(resolver);
  });
});
