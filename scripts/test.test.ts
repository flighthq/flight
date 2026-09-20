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
  it('defaults to the unit project when no project is specified', () => {
    expect(resolveVitestArguments([])).toEqual(['--project', 'unit']);
    expect(resolveVitestArguments(['swf', '--update'])).toEqual(['--project', 'unit', 'swf', '--update']);
  });

  it('passes through an explicit --project without injecting the default', () => {
    expect(resolveVitestArguments(['--project', 'isolated'])).toEqual(['--project', 'isolated']);
    expect(resolveVitestArguments(['--project=tool-capture'])).toEqual(['--project=tool-capture']);
  });

  it('runs all projects when --all is given', () => {
    expect(resolveVitestArguments(['--all'])).toEqual([]);
    expect(resolveVitestArguments(['--all', '--reporter=dot'])).toEqual(['--reporter=dot']);
  });
});

describe('assessVitestRun', () => {
  it('accepts status zero only when every scheduled file completed successfully', () => {
    expect(assessVitestRun(0, completeReport)).toEqual({ exitCode: 0 });
  });

  it('rejects a non-zero exit', () => {
    expect(assessVitestRun(1, completeReport)).toEqual({ exitCode: 1 });
  });

  it('rejects a missing completion event', () => {
    const result = assessVitestRun(0, undefined);
    expect(result.exitCode).toBe(1);
    expect(result.diagnostic).toMatch(/did not produce.*completion/);
  });

  it('rejects a run that started but never ended', () => {
    const result = assessVitestRun(0, { ...completeReport, runEnded: false });
    expect(result.exitCode).toBe(1);
    expect(result.diagnostic).toMatch(/run-completion/);
  });

  it('rejects unhandled worker errors even with status zero', () => {
    const result = assessVitestRun(0, { ...completeReport, unhandledErrors: 2 });
    expect(result.exitCode).toBe(1);
    expect(result.diagnostic).toMatch(/2 unhandled/);
  });

  it('rejects a non-passed result reason', () => {
    const result = assessVitestRun(0, { ...completeReport, reason: 'failed' });
    expect(result.exitCode).toBe(1);
    expect(result.diagnostic).toMatch(/failed/);
  });

  it('lists incomplete files when expected exceeds completed', () => {
    const result = assessVitestRun(0, { ...completeReport, completed: ['/repo/a.test.ts'] });
    expect(result.exitCode).toBe(1);
    expect(result.diagnostic).toMatch(/b\.test\.ts/);
  });
});

describe('preserveRequiredReporter', () => {
  it('leaves arguments alone when no reporter override is present', () => {
    expect(preserveRequiredReporter(['--project', 'unit'], '/repo/completeness.ts')).toEqual(['--project', 'unit']);
  });

  it('appends the required reporter when the caller overrides reporters', () => {
    expect(preserveRequiredReporter(['--reporter=dot'], '/repo/completeness.ts')).toEqual([
      '--reporter=dot',
      '--reporter=/repo/completeness.ts',
    ]);
  });
});
