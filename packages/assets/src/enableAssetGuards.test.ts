import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';

import { acquireAsset, createAssetLibrary, registerAssetDescriptor } from './assetLibrary';
import { areAssetGuardsEnabled, disableAssetGuards, enableAssetGuards } from './enableAssetGuards';

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(8);
  addLogSink(sink.sink);
  try {
    run();
    return getMemoryLogSinkEntries(sink);
  } finally {
    removeLogSink(sink.sink);
  }
}

describe('areAssetGuardsEnabled', () => {
  it('reports guard state per library', () => {
    const guarded = createAssetLibrary();
    const unguarded = createAssetLibrary();
    enableAssetGuards(guarded);
    expect(areAssetGuardsEnabled(guarded)).toBe(true);
    expect(areAssetGuardsEnabled(unguarded)).toBe(false);
  });
});

describe('disableAssetGuards', () => {
  it('restores terse rejection without a warning', async () => {
    const library = createAssetLibrary();
    enableAssetGuards(library);
    disableAssetGuards(library);
    let rejection!: Promise<unknown>;
    const entries = captureLog(() => {
      rejection = acquireAsset(library, 'disabled');
    });
    await expect(rejection).rejects.toThrow('no descriptor');
    expect(entries).toEqual([]);
  });
});

describe('enableAssetGuards', () => {
  it('warns once with descriptor registration guidance while preserving the rejection', async () => {
    const library = createAssetLibrary();
    enableAssetGuards(library);
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    const entries = captureLog(() => {
      first = acquireAsset(library, 'guard-missing-descriptor');
      second = acquireAsset(library, 'guard-missing-descriptor');
    });
    await expect(first).rejects.toThrow('no descriptor');
    await expect(second).rejects.toThrow('no descriptor');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ channel: 'assets' });
    expect(entries[0].data).toMatchObject({ id: 'guard-missing-descriptor', status: 'missing-descriptor' });
    expect(String((entries[0].data as Record<string, unknown>).message)).toContain('registerAssetDescriptor');
  });

  it('identifies an unregistered loader type and names its fixing call', async () => {
    const library = createAssetLibrary();
    registerAssetDescriptor(library, { id: 'guard-missing-loader', type: 'acme.custom', url: 'asset.bin' });
    enableAssetGuards(library);
    let rejection!: Promise<unknown>;
    const entries = captureLog(() => {
      rejection = acquireAsset(library, 'guard-missing-loader');
    });
    await expect(rejection).rejects.toThrow('no loader');
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toMatchObject({ status: 'missing-loader', type: 'acme.custom' });
    expect(String((entries[0].data as Record<string, unknown>).message)).toContain('registerAssetLoader');
  });
});
