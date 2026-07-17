import { createDisplayObject } from '@flighthq/displayobject';
import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log';
import { addNodeChild } from '@flighthq/node';

import {
  disableInteractionGuards,
  enableInteractionGuards,
  explainInteractionHitEligibility,
} from './enableInteractionGuards';
import { connectInteractionSignal, createInteractionManager } from './interactionManager';
import { setNodeFocusable, setNodeHitTestEnabled } from './nodeInteractionState';

afterEach(() => {
  disableInteractionGuards();
});

describe('disableInteractionGuards', () => {
  it('stops the guard from warning', () => {
    const root = createDisplayObject();
    const manager = createInteractionManager(root);
    enableInteractionGuards();
    disableInteractionGuards();
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      connectInteractionSignal(manager, root, 'onPointerDown', () => {});
      expect(getMemoryLogSinkEntries(sink).length).toBe(0);
    } finally {
      removeLogSink(sink.sink);
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
    enableInteractionGuards();
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      connectInteractionSignal(manager, root, 'onPointerDown', () => {});
      expect(getMemoryLogSinkEntries(sink).length).toBe(0);
    } finally {
      removeLogSink(sink.sink);
    }
  });

  it('warns once when a listener targets a node with no hit-testable subtree', () => {
    const root = createDisplayObject();
    const manager = createInteractionManager(root);
    enableInteractionGuards();
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      connectInteractionSignal(manager, root, 'onPointerDown', () => {});
      const entries = getMemoryLogSinkEntries(sink);
      expect(entries.length).toBe(1);
      expect(String((entries[0].data as Record<string, unknown>).message)).toContain('setNodeHitTestEnabled');
    } finally {
      removeLogSink(sink.sink);
    }
  });

  it('warns a focus listener toward setNodeFocusable, and stays silent once a focus stop exists', () => {
    const root = createDisplayObject();
    const manager = createInteractionManager(root);
    enableInteractionGuards();
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      connectInteractionSignal(manager, root, 'onFocusIn', () => {});
      const entries = getMemoryLogSinkEntries(sink);
      expect(entries.length).toBe(1);
      expect(String((entries[0].data as Record<string, unknown>).message)).toContain('setNodeFocusable');

      const focusable = createDisplayObject();
      setNodeFocusable(focusable, true);
      addNodeChild(root, focusable);
      connectInteractionSignal(manager, root, 'onFocusOut', () => {});
      expect(getMemoryLogSinkEntries(sink).length).toBe(1);
    } finally {
      removeLogSink(sink.sink);
    }
  });
});

describe('explainInteractionHitEligibility', () => {
  it('reports self eligibility and whether the subtree has a candidate', () => {
    const root = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(root, child);
    expect(explainInteractionHitEligibility(root)).toEqual({ eligible: false, hasEligibleInSubtree: false });
    setNodeHitTestEnabled(child, true);
    expect(explainInteractionHitEligibility(root)).toEqual({ eligible: false, hasEligibleInSubtree: true });
    setNodeHitTestEnabled(root, true);
    expect(explainInteractionHitEligibility(root)).toEqual({ eligible: true, hasEligibleInSubtree: true });
  });
});
