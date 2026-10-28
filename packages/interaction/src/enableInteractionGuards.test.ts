import type { LogState } from '@flighthq/log/contract';
import {
  addLogSink,
  createLogState,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  removeLogSink,
} from '@flighthq/log/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { LogEntry, MemoryLogSink } from '@flighthq/types/contract';

import {
  disableInteractionGuards,
  enableInteractionGuards,
  explainInteractionHitEligibility,
} from './enableInteractionGuards.ts';
import { connectInteractionSignal, createInteractionManager } from './interactionManager.ts';
import { setNodeFocusable, setNodeHitTestEnabled } from './nodeInteractionState.ts';

function clock(): number {
  return 0;
}

function readLogEntries(sink: Readonly<MemoryLogSink>): LogEntry[] {
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, sink);
  return entries;
}

beforeEach(() => {
  logState = createLogState();
});

afterEach(() => {
  disableInteractionGuards();
});

describe('disableInteractionGuards', () => {
  it('stops the guard from warning', () => {
    const root = createDisplayObject();
    const manager = createInteractionManager(root);
    enableInteractionGuards(logState, clock);
    disableInteractionGuards();
    const sink = createMemoryLogSink(8);
    addLogSink(logState, sink.sink);
    try {
      connectInteractionSignal(manager, root, 'onPointerDown', () => {});
      expect(readLogEntries(sink).length).toBe(0);
    } finally {
      removeLogSink(logState, sink.sink);
    }
  });
});

describe('enableInteractionGuards', () => {
  it('does not warn when the target subtree has an opted-in node', () => {
    const root = createDisplayObject();
    const child = createDisplayObject();
    setNodeHitTestEnabled(child, true);
    addNodeChild(root, child);
    const manager = createInteractionManager(root);
    enableInteractionGuards(logState, clock);
    const sink = createMemoryLogSink(8);
    addLogSink(logState, sink.sink);
    try {
      connectInteractionSignal(manager, root, 'onPointerDown', () => {});
      expect(readLogEntries(sink).length).toBe(0);
    } finally {
      removeLogSink(logState, sink.sink);
    }
  });

  it('warns once when a listener targets a node with no hit-testable subtree', () => {
    const root = createDisplayObject();
    const manager = createInteractionManager(root);
    enableInteractionGuards(logState, clock);
    const sink = createMemoryLogSink(8);
    addLogSink(logState, sink.sink);
    try {
      connectInteractionSignal(manager, root, 'onPointerDown', () => {});
      const entries = readLogEntries(sink);
      expect(entries.length).toBe(1);
      expect(String((entries[0].data as Record<string, unknown>).message)).toContain('setNodeHitTestEnabled');
    } finally {
      removeLogSink(logState, sink.sink);
    }
  });

  it('warns a focus listener toward setNodeFocusable, and stays silent once a focus stop exists', () => {
    const root = createDisplayObject();
    const manager = createInteractionManager(root);
    enableInteractionGuards(logState, clock);
    const sink = createMemoryLogSink(8);
    addLogSink(logState, sink.sink);
    try {
      connectInteractionSignal(manager, root, 'onFocusIn', () => {});
      const entries = readLogEntries(sink);
      expect(entries.length).toBe(1);
      expect(String((entries[0].data as Record<string, unknown>).message)).toContain('setNodeFocusable');

      const focusable = createDisplayObject();
      setNodeFocusable(focusable, true);
      addNodeChild(root, focusable);
      connectInteractionSignal(manager, root, 'onFocusOut', () => {});
      expect(readLogEntries(sink).length).toBe(1);
    } finally {
      removeLogSink(logState, sink.sink);
    }
  });
});

describe('explainInteractionHitEligibility', () => {
  it('reports self eligibility and whether the subtree has a candidate', () => {
    const root = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(root, child);
    expect(explainInteractionHitEligibility(root)).toMatchObject({ eligible: false, hasEligibleInSubtree: false });
    setNodeHitTestEnabled(child, true);
    expect(explainInteractionHitEligibility(root)).toMatchObject({ eligible: false, hasEligibleInSubtree: true });
    setNodeHitTestEnabled(root, true);
    expect(explainInteractionHitEligibility(root)).toMatchObject({ eligible: true, hasEligibleInSubtree: true });
  });
});

let logState: LogState = createLogState();
