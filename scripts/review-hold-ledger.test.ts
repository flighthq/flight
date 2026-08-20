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

describe('recordReviewHolds after a release', () => {
  // ★ THE RATCHET. A release is a signed statement that the cell may gate; if a later hold could take it
  // back, every failure would have a one-word cure and `held` would drift from "not yet decided" to "not
  // looked at". The refusal names the release so a deliberate reversal is still possible — by editing the
  // ledger, which leaves a diff, rather than by a click that leaves only an outcome.
  it('refuses to re-hold a cell that was released', () => {
    const ledger: ReviewHoldLedger = { schemaVersion: 2, held: {}, history: [] };
    recordReviewHolds(ledger, ['functional/a/webgl'], 'reviewer', 'deferred', '2026-08-20T00:00:00.000Z');
    recordReviewHoldReleases(ledger, ['functional/a/webgl'], 'joshua', 'looks right', '2026-08-20T01:00:00.000Z');

    expect(() =>
      recordReviewHolds(ledger, ['functional/a/webgl'], 'reviewer', 'second thoughts', '2026-08-20T02:00:00.000Z'),
    ).toThrow('releasing is one-way');
  });

  // The refusal has to say WHICH release it honours, or the only way to understand it is to read the
  // ledger by hand — and the reason a reviewer needs is the one recorded at release time.
  it('names the release that blocks the re-hold', () => {
    const ledger: ReviewHoldLedger = { schemaVersion: 2, held: {}, history: [] };
    recordReviewHolds(ledger, ['functional/a/webgl'], 'reviewer', 'deferred', '2026-08-20T00:00:00.000Z');
    recordReviewHoldReleases(ledger, ['functional/a/webgl'], 'joshua', 'looks right', '2026-08-20T01:00:00.000Z');

    expect(() =>
      recordReviewHolds(ledger, ['functional/a/webgl'], 'reviewer', 'again', '2026-08-20T02:00:00.000Z'),
    ).toThrow(/joshua.*looks right/);
  });

  // The ratchet applies to REVERSAL, not to holding: a cell nobody released is held as normal.
  it('still holds a cell with no release in its history', () => {
    const ledger: ReviewHoldLedger = { schemaVersion: 2, held: {}, history: [] };

    expect(
      recordReviewHolds(ledger, ['functional/b/webgl'], 'reviewer', 'deferred', '2026-08-20T00:00:00.000Z'),
    ).toEqual(['functional/b/webgl']);
  });
});
