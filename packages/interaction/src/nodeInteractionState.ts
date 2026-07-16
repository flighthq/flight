import { getNodeRuntime } from '@flighthq/node';
import type { Cursor, HitArea, NodeAny, NodeInteractionState, NodeRuntime } from '@flighthq/types';

/**
 * Allocates a `NodeInteractionState` with all fields at their defaults: NOT a hit candidate (hit
 * testing is opt-in), no hit area, no cursor, not focusable. Prefer this over an object literal so
 * every field is set consistently.
 */
export function createNodeInteractionState(): NodeInteractionState {
  return {
    cursor: null,
    focusable: false,
    hitArea: null,
    hitTestEnabled: false,
    tabIndex: -1,
  };
}

/**
 * Returns the node's interaction-state cell, creating it on first use. Use this when about to write a
 * field; readers should prefer the typed getters, which treat an absent cell as defaults.
 */
export function enableNodeInteractionState(source: NodeAny): NodeInteractionState {
  const runtime = getNodeRuntime(source) as NodeRuntime<NodeAny>;
  return (runtime.interactionState ??= createNodeInteractionState());
}

/** Rollover cursor for this node, or `null` when unset (inherits nearest ancestor / backend default). */
export function getNodeCursor(source: Readonly<NodeAny>): Cursor | null {
  return getNodeInteractionState(source)?.cursor ?? null;
}

/** Hit-area proxy overriding this node's own geometry, or `null` when it hit-tests its own geometry. */
export function getNodeHitArea(source: Readonly<NodeAny>): HitArea | null {
  return getNodeInteractionState(source)?.hitArea ?? null;
}

/** Raw interaction-state cell, or `null` if the node has never had one enabled. */
export function getNodeInteractionState(source: Readonly<NodeAny>): NodeInteractionState | null {
  return (getNodeRuntime(source) as NodeRuntime<NodeAny>).interactionState;
}

/** Focus-order key for this node; `-1` (the default) means natural order. */
export function getNodeTabIndex(source: Readonly<NodeAny>): number {
  return getNodeInteractionState(source)?.tabIndex ?? -1;
}

/** Whether this node is a keyboard focus target (default `false` — focus is opt-in). */
export function isNodeFocusable(source: Readonly<NodeAny>): boolean {
  return getNodeInteractionState(source)?.focusable ?? false;
}

/** Whether this node is a hit candidate. Default `false` — hit testing is opt-in per node. */
export function isNodeHitTestEnabled(source: Readonly<NodeAny>): boolean {
  return getNodeInteractionState(source)?.hitTestEnabled ?? false;
}

/** Sets the rollover cursor for this node; `null` clears it (inherits nearest ancestor / default). */
export function setNodeCursor(source: NodeAny, cursor: Cursor | null): void {
  enableNodeInteractionState(source).cursor = cursor;
}

/** Marks this node as a keyboard focus target (or not). */
export function setNodeFocusable(source: NodeAny, focusable: boolean): void {
  enableNodeInteractionState(source).focusable = focusable;
}

/**
 * Sets the hit region this node presents; `null` restores own-geometry hit testing. Setting a hitArea
 * makes the node an atomic hit unit (stops recursion into children, hit resolves here). See `HitArea`
 * for the region forms (`Rectangle`/`Path`/`'bounds'` in local space, or a `Node` proxy in world space).
 */
export function setNodeHitArea(source: NodeAny, hitArea: HitArea | null): void {
  enableNodeInteractionState(source).hitArea = hitArea;
}

/** Opts this node into (or out of) hit testing. Default is out — a node is a candidate only once enabled. */
export function setNodeHitTestEnabled(source: NodeAny, enabled: boolean): void {
  enableNodeInteractionState(source).hitTestEnabled = enabled;
}

/** Sets this node's focus-order key; `-1` means natural order. */
export function setNodeTabIndex(source: NodeAny, tabIndex: number): void {
  enableNodeInteractionState(source).tabIndex = tabIndex;
}
