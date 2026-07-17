import { getNodeParent, getNodeRuntime, getNodeWorldBoundsRectangle } from '@flighthq/node';
import { connectSignal, disconnectSignal, emitSignal } from '@flighthq/signals';
import type {
  FocusDirection,
  FocusEventData,
  FocusManager,
  FocusManagerOptions,
  FocusNavigationInput,
  FocusNavigationOptions,
  InputKeyboardData,
  NodeAny,
  Signal,
  Spatial2DNode,
} from '@flighthq/types';

import { getInteractionSignals } from './interactionManager';
import { getNodeTabIndex, isNodeFocusable } from './nodeInteractionState';

/** Clears focus: the previously focused node (if any) receives `onFocusOut` and the manager holds none. */
export function clearFocus<N extends NodeAny>(manager: FocusManager<N>): void {
  setFocusedNode(manager, null);
}

/**
 * Wires a keyboard source into a focus manager: Tab advances focus, Shift+Tab retreats, and — when
 * `options.arrowKeys` is set — the arrow keys drive directional (spatial) navigation. Returns a disconnect
 * function. The manager owns focus state; this only translates keys into navigation calls, so an app can
 * equally drive `focusNextNode` / `focusNodeInDirection` from its own input handling instead.
 **/
export function connectFocusNavigation<N extends NodeAny>(
  input: FocusNavigationInput,
  manager: FocusManager<N>,
  options: Readonly<FocusNavigationOptions> = {},
): () => void {
  const arrowKeys = options.arrowKeys ?? false;
  const onKeyDown = (data: Readonly<InputKeyboardData>) => {
    if (data.key === 'Tab') {
      if (data.shiftKey) focusPreviousNode(manager);
      else focusNextNode(manager);
      return;
    }
    if (!arrowKeys) return;
    const direction = arrowKeyDirection(data.key);
    if (direction !== null) focusNodeInDirection(manager, direction);
  };
  connectSignal(input.onKeyDown, onKeyDown);
  return () => disconnectSignal(input.onKeyDown, onKeyDown);
}

/** Allocates a focus manager for `root`. `wrap` (default `true`) cycles tab navigation past the ends. */
export function createFocusManager<N extends NodeAny>(
  root: N,
  options: Readonly<FocusManagerOptions> = {},
): FocusManager<N> {
  return {
    focused: null,
    root,
    wrap: options.wrap ?? true,
  };
}

/**
 * Moves focus to the next stop in tab order and returns it, or `null` if there is nowhere to go (no
 * focusable nodes, or already at the last stop with `wrap` off). With nothing focused, focuses the first.
 **/
export function focusNextNode<N extends NodeAny>(manager: FocusManager<N>): N | null {
  return stepFocus(manager, 1);
}

/**
 * Moves focus to the nearest focus stop in `direction` from the focused node's world-bounds center and
 * returns it, or `null` when nothing is focused yet or no stop lies that way. The D-pad / analog-stick
 * navigation model: candidates are scored by distance along the axis plus a perpendicular-offset penalty,
 * so the most directly-aligned stop wins.
 **/
export function focusNodeInDirection<N extends NodeAny>(manager: FocusManager<N>, direction: FocusDirection): N | null {
  const current = manager.focused;
  if (current === null) return null;

  const order = getFocusOrder(manager, _orderScratch as N[]);
  const origin = boundsCenter(current, _originCenter);
  const originX = origin.x;
  const originY = origin.y;
  let best: N | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of order) {
    if (candidate === current) continue;
    const center = boundsCenter(candidate, _candidateCenter);
    const score = directionScore(direction, originX, originY, center.x, center.y);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (best !== null) setFocusedNode(manager, best);
  return best;
}

/** Moves focus to the previous stop in tab order; the reverse of `focusNextNode`. */
export function focusPreviousNode<N extends NodeAny>(manager: FocusManager<N>): N | null {
  return stepFocus(manager, -1);
}

/** The node currently holding focus, or `null`. */
export function getFocusedNode<N extends NodeAny>(manager: FocusManager<N>): N | null {
  return manager.focused;
}

/**
 * Fills `out` (cleared first) with the manager's focus stops in tab order and returns it: every focusable,
 * enabled node in the subtree, with explicit `tabIndex >= 0` stops sorted ascending ahead of the natural
 * tree-order stops (`tabIndex -1`). A disabled node and its whole subtree are skipped. This is the engine
 * primitive the navigation functions walk; call it directly to render a focus ring or inspect tab order.
 **/
export function getFocusOrder<N extends NodeAny>(manager: FocusManager<N>, out: N[] = []): N[] {
  out.length = 0;
  collectFocusStops(manager.root, out as NodeAny[]);
  out.sort(byTabIndexOrder);
  return out;
}

/** Whether `node` is the manager's currently focused node. */
export function isNodeFocused<N extends NodeAny>(manager: FocusManager<N>, node: N): boolean {
  return manager.focused === node;
}

/**
 * Focuses a specific node (or `null` to clear focus), firing `onFocusOut` on the previously focused node
 * and `onFocusIn` on the new one — both bubbling up to `root`, with `relatedTarget` set to the node on the
 * other side of the change. Returns `false` without changing anything if `node` is non-null but not
 * focusable (`setNodeFocusable` was never called); `true` otherwise, including a no-op refocus of the same
 * node. `node` is assumed to live in the managed subtree; ancestry is not validated.
 **/
export function setFocusedNode<N extends NodeAny>(manager: FocusManager<N>, node: N | null): boolean {
  if (node !== null && !isNodeFocusable(node)) return false;
  const previous = manager.focused;
  if (node === previous) return true;

  manager.focused = node;
  if (previous !== null) emitFocusSignal(previous, manager.root, 'onFocusOut', node);
  if (node !== null) emitFocusSignal(node, manager.root, 'onFocusIn', previous);
  return true;
}

function arrowKeyDirection(key: string): FocusDirection | null {
  switch (key) {
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'ArrowUp':
      return 'up';
    default:
      return null;
  }
}

// Writes the world-bounds center of a node into `out` and returns it. Directional navigation compares
// these centers; the node is treated as a 2D spatial node (all display objects are).
function boundsCenter(node: NodeAny, out: { x: number; y: number }): { x: number; y: number } {
  const bounds = getNodeWorldBoundsRectangle(node as unknown as Spatial2DNode);
  out.x = bounds.x + bounds.width / 2;
  out.y = bounds.y + bounds.height / 2;
  return out;
}

// Stable-sort comparator: explicit `tabIndex >= 0` stops ascending, then natural (`-1`) stops. A stable
// sort keeps the DFS (tree) order among equal keys, so natural stops stay in document order.
function byTabIndexOrder(a: NodeAny, b: NodeAny): number {
  return focusOrderKey(a) - focusOrderKey(b);
}

function collectFocusStops(node: NodeAny, out: NodeAny[]): void {
  if (!node.enabled) return;
  if (isNodeFocusable(node)) out.push(node);
  const children = getNodeRuntime(node).children;
  if (children !== null) {
    for (const child of children) collectFocusStops(child as NodeAny, out);
  }
}

// Scores a candidate center against the origin for `direction`: distance along the axis plus twice the
// perpendicular offset (so aligned stops beat far-off-axis ones). Returns Infinity for anything not on the
// requested side, excluding it.
function directionScore(direction: FocusDirection, ox: number, oy: number, cx: number, cy: number): number {
  const dx = cx - ox;
  const dy = cy - oy;
  let along: number;
  let perpendicular: number;
  switch (direction) {
    case 'right':
      along = dx;
      perpendicular = dy;
      break;
    case 'left':
      along = -dx;
      perpendicular = dy;
      break;
    case 'down':
      along = dy;
      perpendicular = dx;
      break;
    default:
      along = -dy;
      perpendicular = dx;
      break;
  }
  if (along <= DIRECTION_EPSILON) return Number.POSITIVE_INFINITY;
  return along + 2 * Math.abs(perpendicular);
}

// Bubbles a focus signal from `target` up to `root`, reusing the shared `_focusData` payload. Focus
// signals bubble (like pointer signals) but are not cancelable — there is no meaningful "prevent" for a
// focus change that has already happened.
function emitFocusSignal(target: NodeAny, root: NodeAny, name: FocusSignalName, relatedTarget: NodeAny | null): void {
  _focusData.relatedTarget = relatedTarget;
  _focusData.target = target;
  let current: NodeAny | null = target;
  while (current !== null) {
    _focusData.currentTarget = current;
    const signals = getInteractionSignals(current);
    const signal = signals !== null ? signals[name] : null;
    if (signal !== null) emitSignal(signal as Signal<(data: Readonly<FocusEventData>) => void>, _focusData);
    if (current === root) break;
    current = getNodeParent(current) as NodeAny | null;
  }
}

function focusOrderKey(node: NodeAny): number {
  const tabIndex = getNodeTabIndex(node);
  return tabIndex < 0 ? Number.POSITIVE_INFINITY : tabIndex;
}

// Advances focus by `delta` (+1 next, -1 previous) through the current focus order, wrapping when the
// manager allows it. Captures the target before emitting, so a slot re-entering navigation cannot corrupt
// the returned value. Returns the newly focused node, or `null` when there is nowhere to move.
function stepFocus<N extends NodeAny>(manager: FocusManager<N>, delta: number): N | null {
  const order = getFocusOrder(manager, _orderScratch as N[]);
  if (order.length === 0) return null;

  const current = manager.focused;
  const from = current !== null ? order.indexOf(current) : -1;
  let index: number;
  if (from === -1) {
    index = delta > 0 ? 0 : order.length - 1;
  } else {
    index = from + delta;
    if (index < 0 || index >= order.length) {
      if (!manager.wrap) return null;
      index = (index + order.length) % order.length;
    }
  }

  const next = order[index]!;
  setFocusedNode(manager, next);
  return next;
}

type FocusSignalName = 'onFocusIn' | 'onFocusOut';

const DIRECTION_EPSILON = 0.0001;
const _candidateCenter = { x: 0, y: 0 };
const _focusData: FocusEventData = { currentTarget: null, relatedTarget: null, target: null };
const _orderScratch: NodeAny[] = [];
const _originCenter = { x: 0, y: 0 };
