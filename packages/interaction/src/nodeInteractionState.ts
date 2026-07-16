import { getNodeRuntime } from '@flighthq/node';
import type { Cursor, HitArea, NodeAny, NodeInteractionState, NodeRuntime } from '@flighthq/types';

/**
 * Allocates a `NodeInteractionState` with all fields at their defaults: fully hit-testable, no hit-area
 * proxy, no cursor, not focusable. Prefer this over an object literal so every field is set consistently.
 */
export function createNodeInteractionState(): NodeInteractionState {
  return {
    cursor: null,
    focusable: false,
    hitArea: null,
    hitTestChildren: true,
    hitTestEnabled: true,
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

/** Whether the hit-test walk descends into this node's subtree (default `true`). */
export function hasNodeHitTestChildren(source: Readonly<NodeAny>): boolean {
  const state = getNodeInteractionState(source);
  return state === null ? true : state.hitTestChildren;
}

/** Whether this node is a keyboard focus target (default `false` — focus is opt-in). */
export function isNodeFocusable(source: Readonly<NodeAny>): boolean {
  return getNodeInteractionState(source)?.focusable ?? false;
}

/** Whether this node registers a hit on its own geometry (default `true`). */
export function isNodeHitTestEnabled(source: Readonly<NodeAny>): boolean {
  const state = getNodeInteractionState(source);
  return state === null ? true : state.hitTestEnabled;
}

/** Sets the rollover cursor for this node; `null` clears it (inherits nearest ancestor / default). */
export function setNodeCursor(source: NodeAny, cursor: Cursor | null): void {
  enableNodeInteractionState(source).cursor = cursor;
}

/** Marks this node as a keyboard focus target (or not). */
export function setNodeFocusable(source: NodeAny, focusable: boolean): void {
  enableNodeInteractionState(source).focusable = focusable;
}

/** Installs a hit-area proxy for this node; `null` restores own-geometry hit testing. */
export function setNodeHitArea(source: NodeAny, hitArea: HitArea | null): void {
  enableNodeInteractionState(source).hitArea = hitArea;
}

/** Enables or disables descent into this node's subtree during hit testing (the `mouseChildren` role). */
export function setNodeHitTestChildren(source: NodeAny, enabled: boolean): void {
  enableNodeInteractionState(source).hitTestChildren = enabled;
}

/** Enables or disables this node's own hit registration (the `mouseEnabled` role). */
export function setNodeHitTestEnabled(source: NodeAny, enabled: boolean): void {
  enableNodeInteractionState(source).hitTestEnabled = enabled;
}

/** Sets this node's focus-order key; `-1` means natural order. */
export function setNodeTabIndex(source: NodeAny, tabIndex: number): void {
  enableNodeInteractionState(source).tabIndex = tabIndex;
}
