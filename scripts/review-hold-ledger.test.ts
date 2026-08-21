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
  // ★ THE RATCHET IS IN THE RECORD, NOT IN A REFUSAL. This used to throw, on the reasoning that a release
  // is final — but "removing a hold is a ratchet" is about not letting a release be undone QUIETLY, and
  // holding again is an ordinary new decision on new information. The refusal fired on exactly that
  // sequence in practice: hold, undo, hold again, with no way forward but hand-editing the ledger.
  it('lets a released cell be held again', () => {
    const ledger: ReviewHoldLedger = { schemaVersion: 2, held: {}, history: [] };
    recordReviewHolds(ledger, ['functional/a/webgl'], 'reviewer', 'deferred', '2026-08-20T00:00:00.000Z');
    recordReviewHoldReleases(ledger, ['functional/a/webgl'], 'joshua', 'looks right', '2026-08-20T01:00:00.000Z');

    expect(
      recordReviewHolds(ledger, ['functional/a/webgl'], 'reviewer', 'second thoughts', '2026-08-20T02:00:00.000Z'),
    ).toEqual(['functional/a/webgl']);
    expect(ledger.held['functional/a/webgl']).toBe('second thoughts');
  });

  // What the ratchet actually needs: the reversal is legible afterwards. Allowing the write costs nothing
  // as long as the sequence survives, and the sequence is the thing an auditor reads.
  it('keeps the whole hold/release/hold sequence with its attribution', () => {
    const ledger: ReviewHoldLedger = { schemaVersion: 2, held: {}, history: [] };
    recordReviewHolds(ledger, ['functional/a/webgl'], 'reviewer', 'deferred', '2026-08-20T00:00:00.000Z');
    recordReviewHoldReleases(ledger, ['functional/a/webgl'], 'joshua', 'looks right', '2026-08-20T01:00:00.000Z');
    recordReviewHolds(ledger, ['functional/a/webgl'], 'reviewer', 'second thoughts', '2026-08-20T02:00:00.000Z');

    expect((ledger.history ?? []).map((entry) => [entry.action, entry.actor, entry.reason])).toEqual([
      ['hold', 'reviewer', 'deferred'],
      ['release', 'joshua', 'looks right'],
      ['hold', 'reviewer', 'second thoughts'],
    ]);
  });

  it('still holds a cell with no release in its history', () => {
    const ledger: ReviewHoldLedger = { schemaVersion: 2, held: {}, history: [] };

    expect(
      recordReviewHolds(ledger, ['functional/b/webgl'], 'reviewer', 'deferred', '2026-08-20T00:00:00.000Z'),
    ).toEqual(['functional/b/webgl']);
  });
});
