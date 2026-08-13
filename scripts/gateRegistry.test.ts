import { createGateRegistry } from './gateRegistry';

describe('createGateRegistry', () => {
  it('registers distinct stages in call order', () => {
    const registry = createGateRegistry();
    registry.add('typecheck', 'tsc', ['-b']);
    registry.add('lint', 'oxlint', ['--max-warnings=0']);

    expect(registry.gates).toEqual([
      { args: ['-b'], command: 'tsc', label: 'typecheck' },
      { args: ['--max-warnings=0'], command: 'oxlint', label: 'lint' },
    ]);
  });

  // The witness: two agents added this identical line to check.ts five lines apart, from the same base
  // blob. Neither hunk conflicted, so both applied and the stage registered twice.
  it('rejects a stage name that was already registered', () => {
    const registry = createGateRegistry();
    registry.add('evidence:check', 'tsx', ['scripts/capture-evidence.ts', '--check']);

    expect(() => registry.add('evidence:check', 'tsx', ['scripts/capture-evidence.ts', '--check'])).toThrow(
      /registers the gate 'evidence:check' twice/,
    );
  });

  // Rejecting on the NAME, not on the whole call, is the point: a second registration under the same
  // label is a duplicate however its command and args differ, because the label is what the summary
  // reports and what a reader uses to tell one stage from another.
  it('rejects a repeated name even when the command and args differ', () => {
    const registry = createGateRegistry();
    registry.add('typecheck', 'tsc', ['-b', 'packages/node']);

    expect(() => registry.add('typecheck', 'tsx', ['scripts/typecheck.ts'])).toThrow(/twice/);
  });

  // ★ THE CASE THAT KEEPS THE GUARD AT REGISTRATION RATHER THAN IN A LINTER. check.ts really does
  // contain two `add('typecheck', …)` calls, on the two arms of an `if (scoped) / else`. Only one arm
  // ever runs, so the source is correct and a static duplicate-name scan would report it as a defect —
  // and someone would "fix" a correct conditional to silence the scan. Each arm registers into its own
  // registry here, exactly as one process run does, and neither throws.
  it('accepts the same name from two arms of a conditional, because only one arm runs', () => {
    for (const scoped of [true, false]) {
      const registry = createGateRegistry();
      if (scoped) {
        registry.add('typecheck', 'tsc', ['-b', 'packages/node']);
      } else {
        registry.add('typecheck', 'tsx', ['scripts/typecheck.ts']);
      }
      expect(registry.gates).toHaveLength(1);
    }
  });

  it('leaves the first registration intact when it rejects a duplicate', () => {
    const registry = createGateRegistry();
    registry.add('lint', 'oxlint', ['--max-warnings=0']);
    expect(() => registry.add('lint', 'tsx', ['scripts/other.ts'])).toThrow();

    expect(registry.gates).toEqual([{ args: ['--max-warnings=0'], command: 'oxlint', label: 'lint' }]);
  });
});
