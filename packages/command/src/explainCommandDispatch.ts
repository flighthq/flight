import type { Command, CommandDispatchExplanation, CommandHistory, CompositeCommand } from '@flighthq/types/contract';

import { getCommandBinding } from './commandBinding';

// Why `executeCommand` would refuse, as plain data rather than a message. A separately importable query,
// so a caller who never asks pays nothing for it and the core carries no prose — the diagnostics inversion
// rule. Descends into composites, because a composite whose child kind is unregistered dispatches into a
// no-op that would otherwise look like a successful undo step.
export function explainCommandDispatch(
  history: Readonly<CommandHistory>,
  command: Readonly<Command>,
): CommandDispatchExplanation {
  const missingKind = findMissingCommandKind(history, command);
  return { missingKind, resolved: missingKind === null };
}

function findMissingCommandKind(history: Readonly<CommandHistory>, command: Readonly<Command>): string | null {
  if (getCommandBinding(history, command.kind) === null) return command.kind;
  const children = (command as Readonly<Partial<CompositeCommand>>).children;
  if (children === undefined) return null;
  for (let i = 0; i < children.length; i++) {
    const missing = findMissingCommandKind(history, children[i]);
    if (missing !== null) return missing;
  }
  return null;
}
