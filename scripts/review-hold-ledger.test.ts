import { recordReviewHoldReleases, recordReviewHolds } from '../tools/review/src/holdLedger';
import type { ReviewHoldLedger } from '../tools/review/src/holdLedger';

describe('review hold ledger', () => {
  it('attributes both hold and release actions while removing only the active hold', () => {
    const ledger: ReviewHoldLedger = { schemaVersion: 1, held: {} };
    const keys = ['functional/text-markup/dom', 'functional/text-markup/webgl'];

    expect(recordReviewHolds(ledger, keys, 'Reviewer One', 'glyph placement is wrong', '2026-08-20T00:00:00Z')).toEqual(
      keys,
    );
    expect(ledger.held).toEqual({
      'functional/text-markup/dom': 'glyph placement is wrong',
      'functional/text-markup/webgl': 'glyph placement is wrong',
    });

    expect(
      recordReviewHoldReleases(
        ledger,
        ['functional/text-markup/dom'],
        'Reviewer Two',
        'fresh cross-host captures agree',
        '2026-08-20T01:00:00Z',
      ),
    ).toEqual(['functional/text-markup/dom']);
    expect(ledger.held).toEqual({ 'functional/text-markup/webgl': 'glyph placement is wrong' });
    expect(ledger).toMatchObject({
      schemaVersion: 2,
      history: [
        {
          action: 'hold',
          actor: 'Reviewer One',
          at: '2026-08-20T00:00:00Z',
          keys,
          reason: 'glyph placement is wrong',
        },
        {
          action: 'release',
          actor: 'Reviewer Two',
          at: '2026-08-20T01:00:00Z',
          keys: ['functional/text-markup/dom'],
          priorReasons: { 'functional/text-markup/dom': 'glyph placement is wrong' },
          reason: 'fresh cross-host captures agree',
        },
      ],
    });
  });

  it('refuses to manufacture a release record for a cell that is not held', () => {
    const ledger: ReviewHoldLedger = { schemaVersion: 2, held: {}, history: [] };

    expect(() =>
      recordReviewHoldReleases(
        ledger,
        ['functional/not-held/webgl'],
        'Reviewer',
        'nothing to release',
        '2026-08-20T01:00:00Z',
      ),
    ).toThrow('cell is not held: functional/not-held/webgl');
    expect(ledger).toEqual({ schemaVersion: 2, held: {}, history: [] });
  });
});
