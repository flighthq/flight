import { describe, expect, it } from 'vitest';

import { createCompositeCommand } from './command';
import { registerCommandBinding } from './commandBinding';
import { createCommandHistory } from './commandHistory';
import { explainCommandDispatch } from './explainCommandDispatch';

describe('explainCommandDispatch', () => {
  it('names the unregistered kind behind a refusal', () => {
    const history = createCommandHistory();
    expect(explainCommandDispatch(history, { kind: 'acme.Unbound', label: 'Nope' })).toEqual({
      missingKind: 'acme.Unbound',
      resolved: false,
    });
  });

  it('resolves when the kind is registered', () => {
    const history = createCommandHistory();
    registerCommandBinding(history, 'acme.Bound', { execute: () => undefined, undo: () => undefined });
    expect(explainCommandDispatch(history, { kind: 'acme.Bound', label: 'Yes' })).toEqual({
      missingKind: null,
      resolved: true,
    });
  });

  // A composite whose CHILD kind is unbound executes into a no-op that looks like a successful undo step,
  // which is exactly the silence this query exists to break.
  it('descends into a composite and names an unbound child kind', () => {
    const history = createCommandHistory();
    registerCommandBinding(history, 'CompositeCommand', { execute: () => undefined, undo: () => undefined });
    const composite = createCompositeCommand('Group', [{ kind: 'acme.Unbound', label: 'Child' }]);
    expect(explainCommandDispatch(history, composite).missingKind).toBe('acme.Unbound');
  });

  it('resolves a composite whose children are all bound', () => {
    const history = createCommandHistory();
    registerCommandBinding(history, 'CompositeCommand', { execute: () => undefined, undo: () => undefined });
    registerCommandBinding(history, 'acme.Bound', { execute: () => undefined, undo: () => undefined });
    const composite = createCompositeCommand('Group', [{ kind: 'acme.Bound', label: 'Child' }]);
    expect(explainCommandDispatch(history, composite).resolved).toBe(true);
  });
});
