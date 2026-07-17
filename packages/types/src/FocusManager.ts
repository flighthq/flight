import type { InputSignals } from './InputSignals';
import type { Node, NodeAny, NodeTraits } from './Node';

export type FocusDirection = 'down' | 'left' | 'right' | 'up';

/**
 * Keyboard/spatial focus state for a subtree — the "which node holds focus, and how does focus move
 * between nodes" sibling of `InteractionManager` (which owns pointer picking). Plain data: `root` is the
 * managed subtree, `focused` is the node currently holding focus (or `null`), and `wrap` controls whether
 * linear tab navigation cycles past the ends of the focus order.
 *
 * A node is a focus stop only if `setNodeFocusable` opted it in; `setNodeTabIndex` orders the stops (an
 * explicit `tabIndex >= 0` sorts ahead of the natural tree-order stops, which keep `-1`). Focus changes
 * fire the `onFocusIn` / `onFocusOut` interaction signals, bubbling like pointer signals, so a listener on
 * any ancestor hears a descendant gaining or losing focus. The two managers are independent primitives
 * that only share the `root` and the per-node interaction signal cell — an app that never navigates by
 * keyboard never creates one, and the focus logic tree-shakes out.
 */
export interface FocusManager<N extends NodeAny = Node<NodeTraits>> {
  focused: N | null;
  root: N;
  wrap: boolean;
}

export interface FocusManagerOptions {
  // Whether `focusNextNode` / `focusPreviousNode` cycle past the last/first stop back to the other end.
  // Default `true`. Set `false` for form-like flows that should come to rest at the ends.
  wrap?: boolean;
}

export interface FocusNavigationOptions {
  // Also map the arrow keys to directional (spatial) navigation via `focusNodeInDirection` — the D-pad
  // model for game UIs. Default `false`, so only Tab / Shift+Tab drive linear navigation.
  arrowKeys?: boolean;
}

// The input surface `connectFocusNavigation` wires into: just the keydown stream, so any keyboard source
// (or a synthetic one in tests) satisfies it without pulling the full pointer signal set.
export type FocusNavigationInput = Pick<InputSignals, 'onKeyDown'>;
