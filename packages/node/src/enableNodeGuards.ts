import { logOnce } from '@flighthq/log/contract';
import type { Node } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setReparentNodeGuard } from './hierarchy';

export function areNodeGuardsEnabled(): boolean {
  return nodeGuardsEnabled;
}

export function disableNodeGuards(): void {
  setReparentNodeGuard(null);
  nodeGuardsEnabled = false;
}

// Installs opt-in diagnostics for graph operations that decline rather than invent a result. The core
// modules stay message-free, so an application that omits this one sheds both the text and
// @flighthq/log.
export function enableNodeGuards(): void {
  setReparentNodeGuard(warnOnDeclinedReparent);
  nodeGuardsEnabled = true;
}

// `reparentNode` returning false is a complete no-op, so a caller that ignores the return sees a child
// that simply did not move — no error, no partial state, and nothing to attribute it to. That silence
// is the point of the design and the reason it needs a guard.
function warnOnDeclinedReparent(child: Node, newParent: Node): void {
  logOnce(`node:reparent-singular-parent:${newParent.name ?? '<unnamed>'}`, LogLevel.Warn, {
    child: child.name ?? '<unnamed>',
    message:
      'reparentNode: the new parent has no invertible world matrix, so no local transform could preserve the child’s world transform — nothing was changed. A zero scale on the parent or an ancestor is the usual cause; use addNodeChild to attach without preserving world position.',
    newParent: newParent.name ?? '<unnamed>',
  });
}

let nodeGuardsEnabled = false;
