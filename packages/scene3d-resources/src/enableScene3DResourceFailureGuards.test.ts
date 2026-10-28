import type { LogState } from '@flighthq/log/contract';
import { addLogSink, createLogState, createMemoryLogSink, getMemoryLogSinkEntries } from '@flighthq/log/contract';
import { emitSignal } from '@flighthq/signals/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { HostImageCapability, ImageResourceReference, LogEntry, MemoryLogSink } from '@flighthq/types/contract';
import {
  EntityRuntimeKey,
  ImageResourceFailureKind,
  ImageResourceReferenceKind,
  LogLevel,
  ResourceResolutionState,
} from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  areScene3DResourceFailureGuardsEnabled,
  disableScene3DResourceFailureGuards,
  enableScene3DResourceFailureGuards,
} from './enableScene3DResourceFailureGuards.ts';
import { createScene3DResourceResolver, disposeScene3DResourceResolver } from './sceneResourceResolver.ts';
import { enableScene3DResourceSignals } from './sceneResourceSignals.ts';

const host: { readonly graphics: { readonly image: HostImageCapability } } = {
  graphics: { image: { [EntityRuntimeKey]: undefined, loadImageFromUrl: vi.fn() } },
} as { readonly graphics: { readonly image: HostImageCapability } };
let logState: LogState;

beforeEach(() => {
  logState = createLogState();
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
    const resolver = createScene3DResourceResolver(host.graphics.image);
    expect(areScene3DResourceFailureGuardsEnabled(resolver)).toBe(false);
    enableScene3DResourceFailureGuards(resolver, logState, () => 0);
    expect(areScene3DResourceFailureGuardsEnabled(resolver)).toBe(true);
    disableScene3DResourceFailureGuards(resolver);
    expect(areScene3DResourceFailureGuardsEnabled(resolver)).toBe(false);
    disposeScene3DResourceResolver(resolver);
  });
});

describe('disableScene3DResourceFailureGuards', () => {
  it('is harmless when the guard is absent', () => {
    const resolver = createScene3DResourceResolver(host.graphics.image);
    expect(() => disableScene3DResourceFailureGuards(resolver)).not.toThrow();
    disposeScene3DResourceResolver(resolver);
  });
});

describe('enableScene3DResourceFailureGuards', () => {
  it('warns once per failed attempt, names recovery, and does not change resolver settlement', () => {
    const sink = createMemoryLogSink(4);
    addLogSink(logState, sink.sink);
    const resolver = createScene3DResourceResolver(host.graphics.image);
    const signals = enableScene3DResourceSignals(resolver);
    const ref = failedRef();
    const texture = createTexture({ resource: ref });
    const dispose = enableScene3DResourceFailureGuards(resolver, logState, () => 0);
    const event = { ref, texture };

    expect(() => emitSignal(signals.onResourceFailed, event)).not.toThrow();
    emitSignal(signals.onResourceFailed, event);
    const entries = readMemoryLogEntries(sink);
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
    expect(readMemoryLogEntries(sink)).toHaveLength(2);
    dispose();
    emitSignal(signals.onResourceResolved, event);
    emitSignal(signals.onResourceFailed, event);
    expect(readMemoryLogEntries(sink)).toHaveLength(2);
    disposeScene3DResourceResolver(resolver);
  });

  it('is idempotent for one resolver', () => {
    const sink = createMemoryLogSink(4);
    addLogSink(logState, sink.sink);
    const resolver = createScene3DResourceResolver(host.graphics.image);
    const signals = enableScene3DResourceSignals(resolver);
    const ref = failedRef();
    const texture = createTexture({ resource: ref });
    const firstDispose = enableScene3DResourceFailureGuards(resolver, logState, () => 0);
    const secondDispose = enableScene3DResourceFailureGuards(resolver, logState, () => 0);

    emitSignal(signals.onResourceFailed, { ref, texture });
    expect(readMemoryLogEntries(sink)).toHaveLength(1);
    secondDispose();
    expect(areScene3DResourceFailureGuardsEnabled(resolver)).toBe(false);
    firstDispose();
    disposeScene3DResourceResolver(resolver);
  });
});

function readMemoryLogEntries(sink: Readonly<MemoryLogSink>): LogEntry[] {
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, sink);
  return entries;
}
