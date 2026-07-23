import { logOnce } from '@flighthq/log';
import { getNodeRuntime } from '@flighthq/node';
import type { InteractionHitEligibility, InteractionSignalName, NodeAny } from '@flighthq/types';
import { LogLevel } from '@flighthq/types';

import { setInteractionConnectGuard } from './interactionManager';
import { isNodeFocusable, isNodeHitTestEnabled } from './nodeInteractionState';

/** Uninstalls the guard installed by `enableInteractionGuards`. */
export function disableInteractionGuards(): void {
  setInteractionConnectGuard(null);
}

/**
 * Installs the caller-facing interaction guard (opt-in, dev-only). It warns once — through
 * `@flighthq/log` — when a pointer listener is connected to a node whose subtree contains no
 * hit-testable node, i.e. the "I added a click handler but nothing fires" footgun under opt-in
 * eligibility. Because hit testing is opt-in, this catches forgetting `setNodeHitTestEnabled`.
 *
 * Assumes opt-in precedes the connect (the recommended order); a node opted in *after* connecting a
 * listener would warn spuriously. Not importing this module costs production nothing — the message and
 * the `@flighthq/log` dependency live only here.
 */
export function enableInteractionGuards(): void {
  setInteractionConnectGuard(warnOnInertInteractionTarget);
}

/** Reports whether a node is a hit candidate and whether any node in its subtree is — the seam a
 * developer queries to understand why events do or do not reach a node. */
export function explainInteractionHitEligibility(node: Readonly<NodeAny>): InteractionHitEligibility {
  return {
    eligible: isNodeHitTestEnabled(node),
    hasEligibleInSubtree: hasEligibleNodeInSubtree(node),
  };
}

function hasEligibleNodeInSubtree(node: Readonly<NodeAny>): boolean {
  if (isNodeHitTestEnabled(node)) return true;
  const children = getNodeRuntime(node).children;
  if (children !== null) {
    for (const child of children) {
      if (hasEligibleNodeInSubtree(child)) return true;
    }
  }
  return false;
}

function hasFocusableNodeInSubtree(node: Readonly<NodeAny>): boolean {
  if (isNodeFocusable(node)) return true;
  const children = getNodeRuntime(node).children;
  if (children !== null) {
    for (const child of children) {
      if (hasFocusableNodeInSubtree(child)) return true;
    }
  }
  return false;
}

function warnOnInertInteractionTarget(target: NodeAny, name: InteractionSignalName): void {
  // Keyboard signals dispatch to the manager root regardless of eligibility, so they are exempt.
  if (name === 'onKeyDown' || name === 'onKeyUp') return;

  // Focus signals dispatch from the focus manager based on `focusable`, not hit eligibility, so they get
  // the symmetric check: warn when nothing in the subtree is a focus stop (forgot setNodeFocusable).
  if (name === 'onFocusIn' || name === 'onFocusOut') {
    if (hasFocusableNodeInSubtree(target)) return;
    logOnce(
      'interaction:focus-listener-on-non-focusable',
      LogLevel.Warn,
      {
        message: `connectInteractionSignal('${name}'): target has no focusable node in its subtree — call setNodeFocusable(node, true) so it can receive focus events`,
      },
      'interaction',
    );
    return;
  }

  if (hasEligibleNodeInSubtree(target)) return;
  logOnce(
    'interaction:listener-on-inert-node',
    LogLevel.Warn,
    {
      message: `connectInteractionSignal('${name}'): target has no hit-testable node in its subtree — call setNodeHitTestEnabled(node, true) so it can receive pointer events`,
    },
    'interaction',
  );
}
