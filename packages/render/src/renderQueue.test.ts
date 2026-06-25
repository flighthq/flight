import { createDisplayObject } from '@flighthq/displayobject';
import { addNodeChild } from '@flighthq/node';
import { createSprite } from '@flighthq/sprite';
import type { Renderer, RenderProxy, RenderQueueEntry } from '@flighthq/types';

import { registerRenderer } from './renderer';
import { prepareDisplayObjectRender } from './renderProxy';
import {
  buildRenderQueue,
  clearRenderQueue,
  compareRenderQueueEntries,
  createRenderQueue,
  packRenderSortKey,
  pushRenderQueueEntry,
  sortRenderQueue,
} from './renderQueue';
import { createRenderState } from './renderState';

function makeRenderer(): Renderer {
  return { createData: () => null, submit: vi.fn() };
}

describe('buildRenderQueue', () => {
  it('produces zero entries for a scene with no renderers', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    prepareDisplayObjectRender(state, root);
    const queue = createRenderQueue();
    buildRenderQueue(state, root, queue);
    expect(queue.entryCount).toBe(0);
  });
  it('produces one entry per visible node with a renderer', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(root, child);
    registerRenderer(state, root.kind, makeRenderer());
    prepareDisplayObjectRender(state, root);
    const queue = createRenderQueue();
    buildRenderQueue(state, root, queue);
    expect(queue.entryCount).toBe(2);
  });
  it('skips invisible proxies', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    root.visible = false;
    registerRenderer(state, root.kind, makeRenderer());
    prepareDisplayObjectRender(state, root);
    const queue = createRenderQueue();
    buildRenderQueue(state, root, queue);
    expect(queue.entryCount).toBe(0);
  });
  it('clears the queue before filling it', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    registerRenderer(state, root.kind, makeRenderer());
    prepareDisplayObjectRender(state, root);
    const queue = createRenderQueue();
    buildRenderQueue(state, root, queue);
    const firstCount = queue.entryCount;
    buildRenderQueue(state, root, queue);
    expect(queue.entryCount).toBe(firstCount);
  });
  it('assigns increasing scene-order sort keys', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const child1 = createDisplayObject();
    const child2 = createSprite();
    addNodeChild(root, child1);
    addNodeChild(root, child2);
    registerRenderer(state, root.kind, makeRenderer());
    registerRenderer(state, child1.kind, makeRenderer());
    registerRenderer(state, child2.kind, makeRenderer());
    prepareDisplayObjectRender(state, root);
    const queue = createRenderQueue();
    buildRenderQueue(state, root, queue);
    expect(queue.entries[0].sortKey).toBeLessThan(queue.entries[1].sortKey);
    expect(queue.entries[1].sortKey).toBeLessThan(queue.entries[2].sortKey);
  });
});

describe('clearRenderQueue', () => {
  it('resets entryCount to zero', () => {
    const queue = createRenderQueue();
    const proxy = { alpha: 1 } as unknown as RenderProxy;
    pushRenderQueueEntry(queue, proxy, 0);
    clearRenderQueue(queue);
    expect(queue.entryCount).toBe(0);
  });
  it('preserves entries array capacity', () => {
    const queue = createRenderQueue();
    const proxy = { alpha: 1 } as unknown as RenderProxy;
    pushRenderQueueEntry(queue, proxy, 0);
    const cap = queue.entries.length;
    clearRenderQueue(queue);
    expect(queue.entries.length).toBe(cap);
  });
});

describe('compareRenderQueueEntries', () => {
  it('returns negative when first sort key is smaller', () => {
    const a = { proxy: {}, sortKey: 1 } as unknown as RenderQueueEntry;
    const b = { proxy: {}, sortKey: 5 } as unknown as RenderQueueEntry;
    expect(compareRenderQueueEntries(a, b)).toBeLessThan(0);
  });
  it('returns positive when first sort key is larger', () => {
    const a = { proxy: {}, sortKey: 5 } as unknown as RenderQueueEntry;
    const b = { proxy: {}, sortKey: 1 } as unknown as RenderQueueEntry;
    expect(compareRenderQueueEntries(a, b)).toBeGreaterThan(0);
  });
  it('returns 0 when sort keys are equal', () => {
    const a = { proxy: {}, sortKey: 3 } as unknown as RenderQueueEntry;
    const b = { proxy: {}, sortKey: 3 } as unknown as RenderQueueEntry;
    expect(compareRenderQueueEntries(a, b)).toBe(0);
  });
});

describe('createRenderQueue', () => {
  it('starts with entryCount of 0', () => {
    expect(createRenderQueue().entryCount).toBe(0);
  });
  it('starts with an empty entries array', () => {
    expect(createRenderQueue().entries.length).toBe(0);
  });
});

describe('packRenderSortKey', () => {
  it('opaque geometry sorts before transparent in the same layer', () => {
    const opaque = packRenderSortKey(0, 0.5, false);
    const transparent = packRenderSortKey(0, 0.5, true);
    expect(opaque).toBeLessThan(transparent);
  });
  it('higher layer always sorts after lower layer regardless of opacity', () => {
    const layer0Transparent = packRenderSortKey(0, 1.0, true);
    const layer1Opaque = packRenderSortKey(1, 0.0, false);
    expect(layer1Opaque).toBeGreaterThan(layer0Transparent);
  });
  it('depth increases sort key within the same layer and opacity', () => {
    const near = packRenderSortKey(0, 0.1, false);
    const far = packRenderSortKey(0, 0.9, false);
    expect(far).toBeGreaterThan(near);
  });
  it('clamps layer and depth to valid range', () => {
    expect(() => packRenderSortKey(-1, -0.5, false)).not.toThrow();
    expect(() => packRenderSortKey(99999, 2.0, true)).not.toThrow();
  });
});

describe('pushRenderQueueEntry', () => {
  it('increments entryCount', () => {
    const queue = createRenderQueue();
    const proxy = { alpha: 1 } as unknown as RenderProxy;
    pushRenderQueueEntry(queue, proxy, 0);
    expect(queue.entryCount).toBe(1);
  });
  it('stores the proxy and sort key', () => {
    const queue = createRenderQueue();
    const proxy = { alpha: 1 } as unknown as RenderProxy;
    pushRenderQueueEntry(queue, proxy, 42);
    expect(queue.entries[0].proxy).toBe(proxy);
    expect(queue.entries[0].sortKey).toBe(42);
  });
  it('reuses entries array slots within capacity', () => {
    const queue = createRenderQueue();
    const p1 = { alpha: 1 } as unknown as RenderProxy;
    const p2 = { alpha: 2 } as unknown as RenderProxy;
    pushRenderQueueEntry(queue, p1, 0);
    clearRenderQueue(queue);
    pushRenderQueueEntry(queue, p2, 1);
    expect(queue.entries.length).toBe(1);
    expect(queue.entries[0].proxy).toBe(p2);
  });
});

describe('sortRenderQueue', () => {
  it('sorts entries in ascending sort-key order by default', () => {
    const queue = createRenderQueue();
    pushRenderQueueEntry(queue, {} as unknown as RenderProxy, 3);
    pushRenderQueueEntry(queue, {} as unknown as RenderProxy, 1);
    pushRenderQueueEntry(queue, {} as unknown as RenderProxy, 2);
    sortRenderQueue(queue);
    expect(queue.entries[0].sortKey).toBe(1);
    expect(queue.entries[1].sortKey).toBe(2);
    expect(queue.entries[2].sortKey).toBe(3);
  });
  it('accepts a custom comparator', () => {
    const queue = createRenderQueue();
    pushRenderQueueEntry(queue, {} as unknown as RenderProxy, 1);
    pushRenderQueueEntry(queue, {} as unknown as RenderProxy, 3);
    pushRenderQueueEntry(queue, {} as unknown as RenderProxy, 2);
    sortRenderQueue(queue, (a, b) => b.sortKey - a.sortKey); // descending
    expect(queue.entries[0].sortKey).toBe(3);
    expect(queue.entries[1].sortKey).toBe(2);
    expect(queue.entries[2].sortKey).toBe(1);
  });
  it('only sorts the valid entry window [0..entryCount)', () => {
    const queue = createRenderQueue();
    pushRenderQueueEntry(queue, {} as unknown as RenderProxy, 3);
    pushRenderQueueEntry(queue, {} as unknown as RenderProxy, 1);
    pushRenderQueueEntry(queue, {} as unknown as RenderProxy, 2);
    // Clear and add fewer entries (leaving stale data beyond entryCount).
    clearRenderQueue(queue);
    pushRenderQueueEntry(queue, {} as unknown as RenderProxy, 5);
    pushRenderQueueEntry(queue, {} as unknown as RenderProxy, 4);
    sortRenderQueue(queue);
    expect(queue.entryCount).toBe(2);
    expect(queue.entries[0].sortKey).toBe(4);
    expect(queue.entries[1].sortKey).toBe(5);
  });
});
