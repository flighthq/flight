import { getEntityRuntime as getRawEntityRuntime } from '@flighthq/entity/contract';
import { createLogState, setLogSink } from '@flighthq/log/contract';
import type { LogState } from '@flighthq/log/contract';
import type { HasTransform2D, HasTransform2DRuntime, LogEntry, Node } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { areNodeGuardsEnabled, disableNodeGuards, enableNodeGuards } from './enableNodeGuards.ts';
import { initTransform2DRuntimeTrait, initTransform2DTrait } from './hasTransform2d.ts';
import { reparentNode } from './hierarchy.ts';
import { createNode } from './node.ts';
import { invalidateNodeLocalTransform } from './revision.ts';

// Each test logs into a fresh caller-owned state, so logOnce keys never leak between tests.
let logState: LogState;

beforeEach(() => {
  logState = createLogState();
});

describe('areNodeGuardsEnabled', () => {
  test('reports whether the guards are installed', () => {
    expect(areNodeGuardsEnabled()).toBe(false);
    enableNodeGuards(logState, () => 0);
    expect(areNodeGuardsEnabled()).toBe(true);
    disableNodeGuards();
    expect(areNodeGuardsEnabled()).toBe(false);
  });
});

describe('disableNodeGuards', () => {
  test('leaves the core silent again once removed', () => {
    enableNodeGuards(logState, () => 0);
    disableNodeGuards();
    expect(captureLog(() => reparentNode(transformNode(), collapsedParent('gone')))).toHaveLength(0);
  });
});

describe('enableNodeGuards', () => {
  // `logOnce` keys on the parent name and has no reset, so each triggering test must use a DISTINCT
  // name — a repeat would be deduplicated away and assert nothing while still looking green.
  test('warns, naming both nodes, when a reparent is declined', () => {
    enableNodeGuards(logState, () => 0);
    const child = transformNode();
    child.name = 'child';
    const entries = captureLog(() => reparentNode(child, collapsedParent('collapsed-warns')));
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toMatchObject({ child: 'child', newParent: 'collapsed-warns' });
  });

  test('stays silent when the reparent succeeds', () => {
    enableNodeGuards(logState, () => 0);
    const healthy = transformNode();
    invalidateNodeLocalTransform(healthy);
    expect(captureLog(() => reparentNode(transformNode(), healthy))).toHaveLength(0);
  });
});

afterEach(() => {
  disableNodeGuards();
});

function captureLog(run: () => void): LogEntry[] {
  const entries: LogEntry[] = [];
  setLogSink(logState, (entry) => entries.push(entry));
  try {
    run();
  } finally {
    setLogSink(logState, null);
  }
  return entries;
}

function collapsedParent(name: string): Node<HasTransform2D> & HasTransform2D {
  const parent = transformNode();
  parent.name = name;
  parent.scaleX = 0;
  invalidateNodeLocalTransform(parent);
  return parent;
}

function transformNode(): Node<HasTransform2D> & HasTransform2D {
  const node = createNode('NodeGuardTest') as Node<HasTransform2D> & HasTransform2D;
  initTransform2DTrait(node);
  initTransform2DRuntimeTrait(getRawEntityRuntime(node) as HasTransform2DRuntime);
  return node;
}
