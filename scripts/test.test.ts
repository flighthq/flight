import { resolveVitestArguments } from './test';

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
