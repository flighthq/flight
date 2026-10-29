// Generated from crates/flight-clip/tests/enable_clip_guards_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createLogState, createMemoryLogSink, getMemoryLogSinkEntries, setLogSink } from '@flighthq/log/contract';
import { describe, expect, it } from 'vitest';

import {
  acquireClipRegion,
  clipRegionContainsPoint,
  createClipRegionFromContours,
  disableClipGuards,
  enableClipGuards,
  releaseClipRegion,
} from './contract.ts';

describe('disableClipGuards', () => {
  it('uninstalls all three diagnostics', () => {
    const logs = createLogState();
    const sink = createMemoryLogSink(16);
    setLogSink(logs, sink.sink);
    enableClipGuards(logs, () => 1.0);
    disableClipGuards();
    const region = acquireClipRegion();
    releaseClipRegion(region);
    releaseClipRegion(region);
    clipRegionContainsPoint(region, 0.0, 0.0);
    createClipRegionFromContours([[0.0, 0.0, 1.0]], 'nonZero');
    let entries = [] as never[];
    getMemoryLogSinkEntries(entries, sink);
    expect(entries.length === 0).toBe(true);
    acquireClipRegion();
    acquireClipRegion();
  });
});

describe('enableClipGuards', () => {
  it('reports each lifecycle diagnostic once', () => {
    const logs = createLogState();
    const sink = createMemoryLogSink(16);
    setLogSink(logs, sink.sink);
    enableClipGuards(logs, () => 10.0);
    const invalid = [[0.0, 0.0, 1.0]];
    createClipRegionFromContours(invalid, 'nonZero');
    createClipRegionFromContours(invalid, 'nonZero');
    const region = acquireClipRegion();
    releaseClipRegion(region);
    releaseClipRegion(region);
    clipRegionContainsPoint(region, 0.0, 0.0);
    let entries = [] as never[];
    getMemoryLogSinkEntries(entries, sink);
    expect(entries.length).toEqual(3);
    disableClipGuards();
    acquireClipRegion();
    acquireClipRegion();
  });
});
