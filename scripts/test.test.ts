import { resolveVitestArguments } from './test';

describe('resolveVitestArguments', () => {
  it('selects the dedicated project for the conformance shorthand', () => {
    expect(resolveVitestArguments(['conformance'])).toEqual(['--project', 'conformance']);
    expect(resolveVitestArguments(['conformance', '--reporter=dot'])).toEqual([
      '--project',
      'conformance',
      '--reporter=dot',
    ]);
  });

  it('preserves ordinary path and option selectors', () => {
    expect(resolveVitestArguments([])).toEqual([]);
    expect(resolveVitestArguments(['swf', '--update'])).toEqual(['swf', '--update']);
  });
});
