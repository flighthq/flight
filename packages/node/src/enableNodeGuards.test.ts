import { getEntityRuntime as getRawEntityRuntime } from '@flighthq/entity/contract';
import { clearLogOnceKeys, setLogSink } from '@flighthq/log/contract';
import type { HasTransform2D, HasTransform2DRuntime, LogEntry, Node } from '@flighthq/types/contract';
import { afterEach, describe, expect, test } from 'vitest';

import { areNodeGuardsEnabled, disableNodeGuards, enableNodeGuards } from './enableNodeGuards';
import { initTransform2DRuntimeTrait, initTransform2DTrait } from './hasTransform2d';
import { reparentNode } from './hierarchy';
import { createNode } from './node';
import { invalidateNodeLocalTransform } from './revision';

beforeEach(() => clearLogOnceKeys());

describe('areNodeGuardsEnabled', () => {
  test('reports whether the guards are installed', () => {
    expect(areNodeGuardsEnabled()).toBe(false);
    enableNodeGuards();
    expect(areNodeGuardsEnabled()).toBe(true);
    disableNodeGuards();
    expect(areNodeGuardsEnabled()).toBe(false);
  });
});

describe('disableNodeGuards', () => {
  test('leaves the core silent again once removed', () => {
    enableNodeGuards();
    disableNodeGuards();
    expect(captureLog(() => reparentNode(transformNode(), collapsedParent('gone')))).toHaveLength(0);
  });
});

describe('enableNodeGuards', () => {
  // `logOnce` keys on the parent name and has no reset, so each triggering test must use a DISTINCT
  // name — a repeat would be deduplicated away and assert nothing while still looking green.
  test('warns, naming both nodes, when a reparent is declined', () => {
    enableNodeGuards();
    const child = transformNode();
    child.name = 'child';
    const entries = captureLog(() => reparentNode(child, collapsedParent('collapsed-warns')));
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toMatchObject({ child: 'child', newParent: 'collapsed-warns' });
  });

  test('stays silent when the reparent succeeds', () => {
    enableNodeGuards();
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
  setLogSink((entry) => entries.push(entry));
  try {
    run();
  } finally {
    setLogSink(null);
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
