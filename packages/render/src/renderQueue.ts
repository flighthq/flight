import { getNodeRuntime } from '@flighthq/node';
import type {
  NodeAny,
  Renderable,
  RenderProxy,
  RenderQueue,
  RenderQueueEntry,
  RenderSortKey,
  RenderState,
} from '@flighthq/types';

import { getRenderStateRuntime } from './renderState';

// Fills `out` by walking the prepared subtree rooted at `source` and pushing one entry per visible
// proxy with a renderer. The sort key is the scene-order index (order of encounter in a pre-order
// traversal), preserving scene-graph draw order when no reorder is needed. Call sortRenderQueue
// afterward to reorder by an explicit criterion such as opaque-front-to-back / alpha-back-to-front.
//
// Does not advance the frame id — the prepare pass has already done that. Call
// prepareDisplayObjectRender before buildRenderQueue.
export function buildRenderQueue(state: RenderState, source: Renderable, out: RenderQueue): void {
  clearRenderQueue(out);
  const runtime = getRenderStateRuntime(state);
  const renderProxyMap = runtime.renderProxyMap;
  const stack = _buildStack;
  let stackLength = 1;
  stack[0] = source;
  let sceneOrder = 0;
  while (stackLength > 0) {
    const current = stack[--stackLength];
    const proxy = renderProxyMap.get(current);
    if (proxy === undefined) continue;
    if (!proxy.visible) continue;
    if (proxy.renderer !== null) {
      pushRenderQueueEntry(out, proxy, sceneOrder);
    }
    sceneOrder++;
    // A Renderable is a node or a RenderCache leaf; only nodes carry children, and a cache yields a
    // null-children runtime, so it is safe to read children through the node runtime view.
    const children = getNodeRuntime(current as NodeAny).children;
    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        stack[stackLength++] = children[i];
      }
    }
  }
}

// Clears the queue for reuse. Resets entryCount to 0 without releasing the entries array, so
// subsequent fills in the same frame reuse capacity without allocation.
export function clearRenderQueue(queue: RenderQueue): void {
  queue.entryCount = 0;
}

// Default sort comparator: ascending by sort key (smaller key = drawn first).
export function compareRenderQueueEntries(a: RenderQueueEntry, b: RenderQueueEntry): number {
  return a.sortKey - b.sortKey;
}

// Creates a new empty RenderQueue. The entries array is pre-allocated empty; entries grow as
// pushRenderQueueEntry or buildRenderQueue populates it. Cleared between frames by clearRenderQueue.
export function createRenderQueue(): RenderQueue {
  return { entries: [], entryCount: 0 };
}

// Packs a layer index, a normalized depth (0..1), and an opaque flag into a single sort key
// float. Layer is the most-significant axis; within a layer, opaque geometry sorts before
// transparent (flag 0 < flag 1), and within that bucket depth is the tiebreaker.
//
// Layout (for integer arithmetic; packed into a number):
//   bits [30..16]: layer  (15-bit, 0..32767)
//   bit  [15]:     isTransparent flag (0 = opaque, 1 = transparent)
//   bits [14..0]:  depth bucket (15-bit, 0..32767, derived from depth * 32767)
export function packRenderSortKey(layer: number, depth: number, isTransparent: boolean): RenderSortKey {
  const layerBits = (Math.max(0, Math.min(32767, layer | 0)) & 0x7fff) << 16;
  const transparentBit = isTransparent ? 1 << 15 : 0;
  const depthBits = Math.max(0, Math.min(32767, Math.round(depth * 32767))) & 0x7fff;
  return layerBits | transparentBit | depthBits;
}

// Appends one proxy entry to the queue at the current entryCount position, expanding the entries
// array if needed. The sort key is set by the caller; call sortRenderQueue afterward for order.
export function pushRenderQueueEntry(queue: RenderQueue, proxy: RenderProxy, sortKey: RenderSortKey): void {
  const entry = { proxy, sortKey };
  if (queue.entryCount < queue.entries.length) {
    queue.entries[queue.entryCount] = entry;
  } else {
    queue.entries.push(entry);
  }
  queue.entryCount++;
}

// Sorts queue entries in-place using a comparator function. The default comparator sorts ascending
// by sort key, which preserves scene-graph order when keys are the encounter index from
// buildRenderQueue. Pass a custom comparator to implement opaque-front-to-back /
// transparent-back-to-front partitioning using packRenderSortKey.
export function sortRenderQueue(
  queue: RenderQueue,
  compare?: (a: RenderQueueEntry, b: RenderQueueEntry) => number,
): void {
  // Sort only the valid window [0..entryCount) of the entries array.
  const slice = queue.entries.slice(0, queue.entryCount);
  slice.sort(compare ?? compareRenderQueueEntriesByKey);
  for (let i = 0; i < slice.length; i++) {
    queue.entries[i] = slice[i];
  }
}

function compareRenderQueueEntriesByKey(a: RenderQueueEntry, b: RenderQueueEntry): number {
  return a.sortKey - b.sortKey;
}

// Module-level scratch stack used by buildRenderQueue. Not shared with the per-state tempStack or
// the drawDriver's _drawStack, so prepare, draw, and queue-build can be interleaved safely.
const _buildStack: Renderable[] = [];
