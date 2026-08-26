import { describe, expect, it } from 'vitest';

import { getCreateEntityBaselineIssues } from './create-entity';

describe('create Entity API baseline', () => {
  it('accepts an unchanged review inventory', () => {
    expect(getCreateEntityBaselineIssues(['@flighthq/a createA'], ['@flighthq/a createA'])).toEqual([]);
  });

  it('rejects a newly exported non-Entity create function', () => {
    expect(
      getCreateEntityBaselineIssues(['@flighthq/a createA', '@flighthq/b createB'], ['@flighthq/a createA']),
    ).toEqual(['new non-Entity create function: @flighthq/b createB']);
  });

  it('requires review when an entry becomes Entity-valued or is renamed', () => {
    expect(getCreateEntityBaselineIssues([], ['@flighthq/a createA'])).toEqual([
      'resolved or renamed baseline entry must be reviewed and removed: @flighthq/a createA',
    ]);
  });
});
