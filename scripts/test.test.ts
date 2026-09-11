import { assessVitestRun, preserveRequiredReporter, resolveVitestArguments } from './test';

const completeReport = {
  completed: ['/repo/a.test.ts', '/repo/b.test.ts'],
  expected: ['/repo/a.test.ts', '/repo/b.test.ts'],
  reason: 'passed',
  runEnded: true,
  unhandledErrors: 0,
  version: 1,
} as const;

describe('resolveVitestArguments', () => {
  it('defaults to the shared project when no project is specified', () => {
    expect(resolveVitestArguments([])).toEqual(['--project', 'shared']);
    expect(resolveVitestArguments(['swf', '--update'])).toEqual(['--project', 'shared', 'swf', '--update']);
  });

  it('passes through an explicit --project without injecting shared', () => {
    expect(resolveVitestArguments(['--project', 'isolated'])).toEqual(['--project', 'isolated']);
    expect(resolveVitestArguments(['--project=tool-capture'])).toEqual(['--project=tool-capture']);
  });

  it('runs all projects when --all is given', () => {
    expect(resolveVitestArguments(['--all'])).toEqual([]);
    expect(resolveVitestArguments(['--all', '--reporter=dot'])).toEqual(['--reporter=dot']);
  });

  it('selects the dedicated project for the conformance shorthand', () => {
    expect(resolveVitestArguments(['conformance'])).toEqual(['--project', 'conformance']);
    expect(resolveVitestArguments(['conformance', '--reporter=dot'])).toEqual([
      '--project',
      'conformance',
      '--reporter=dot',
    ]);
  });
});

describe('assessVitestRun', () => {
  it('accepts status zero only when every scheduled file completed successfully', () => {
    expect(assessVitestRun(0, completeReport)).toEqual({ exitCode: 0 });
  });

  it('preserves a nonzero Vitest failure status', () => {
    expect(assessVitestRun(3, completeReport)).toEqual({ exitCode: 3 });
  });

  it('rejects a zero-status worker crash with incomplete files and unhandled errors', () => {
    expect(
      assessVitestRun(0, {
        ...completeReport,
        completed: ['/repo/a.test.ts'],
        unhandledErrors: 1,
      }),
    ).toEqual({
      diagnostic: 'Vitest reported 1 unhandled worker error.',
      exitCode: 1,
    });
  });

  it('rejects a zero-status run whose completion event is missing', () => {
    expect(assessVitestRun(0, { ...completeReport, runEnded: false })).toEqual({
      diagnostic: 'Vitest started but did not produce its structured run-completion event.',
      exitCode: 1,
    });
  });

  it('rejects a zero-status run whose structured report is absent', () => {
    expect(assessVitestRun(0, undefined)).toEqual({
      diagnostic: 'Vitest did not produce its structured completion event.',
      exitCode: 1,
    });
  });

  it('rejects scheduled files that never report module completion', () => {
    expect(assessVitestRun(0, { ...completeReport, completed: ['/repo/a.test.ts'] })).toEqual({
      diagnostic: 'Vitest did not complete 1 scheduled test file: /repo/b.test.ts',
      exitCode: 1,
    });
  });
});

describe('preserveRequiredReporter', () => {
  it('leaves configured reporters intact when the command does not override them', () => {
    expect(preserveRequiredReporter(['--project', 'shared'], '/repo/completeness.ts')).toEqual(['--project', 'shared']);
  });

  it('adds the required reporter when a command overrides configured reporters', () => {
    expect(preserveRequiredReporter(['--reporter=dot'], '/repo/completeness.ts')).toEqual([
      '--reporter=dot',
      '--reporter=/repo/completeness.ts',
    ]);
    expect(preserveRequiredReporter(['--reporter', 'verbose'], '/repo/completeness.ts')).toEqual([
      '--reporter',
      'verbose',
      '--reporter=/repo/completeness.ts',
    ]);
  });
});
