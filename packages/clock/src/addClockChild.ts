import type { Clock } from '@flighthq/types';

// Attaches `child` under `parent`, detaching it from any previous parent first (reparent-safe). After
// this, advancing `parent` cascades into `child`. A no-op if `child` is already parented here.
export function addClockChild(parent: Clock, child: Clock): void {
  if (child.parent === parent) return;
  if (child.parent !== null) removeClockChild(child.parent, child);
  child.parent = parent;
  parent.children.push(child);
}

// Detaches `child` from `parent`, making it a root clock again. A no-op if `child` is not a child of
// `parent`.
export function removeClockChild(parent: Clock, child: Clock): void {
  const index = parent.children.indexOf(child);
  if (index === -1) return;
  parent.children.splice(index, 1);
  child.parent = null;
}
