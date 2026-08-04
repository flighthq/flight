import { describe, expect, it } from 'vitest';

import { getNewestStatusEntryDate, getStatusDate } from '../agents/packages/todo-status-date.mjs';

const LOG = [
  '# render-wgpu — Status Log',
  '',
  '## 2026-07-24 — compressed texture upload',
  '',
  'Body.',
  '',
  '## 2026-06-25 — earlier',
  '',
  'Body.',
].join('\n');

describe('getNewestStatusEntryDate', () => {
  it('returns the newest dated entry regardless of file order', () => {
    expect(getNewestStatusEntryDate(LOG)).toBe('2026-07-24');
    expect(getNewestStatusEntryDate(['## 2026-01-02 — a', '', '## 2026-09-30 — b'].join('\n'))).toBe('2026-09-30');
  });

  it('accepts both heading depths the logs use', () => {
    expect(getNewestStatusEntryDate('### 2026-03-04 — third level')).toBe('2026-03-04');
  });

  it('returns null when no entry is dated', () => {
    expect(getNewestStatusEntryDate('# Status Log\n\n## Untitled entry\n')).toBeNull();
  });

  // A date inside prose is not an entry — only a heading marks one, so the scan must stay anchored.
  it('ignores dates in body prose', () => {
    expect(getNewestStatusEntryDate('## 2026-01-01 — a\n\nSupersedes the 2026-12-31 plan.\n')).toBe('2026-01-01');
  });
});

describe('getStatusDate', () => {
  // The drift this exists for: front matter a month behind the log it summarizes.
  it('prefers the newest entry when the declared date is behind it', () => {
    expect(getStatusDate(LOG, '2026-06-24')).toBe('2026-07-24');
  });

  it('keeps the declared date when it is ahead of every entry', () => {
    expect(getStatusDate(LOG, '2026-08-02')).toBe('2026-08-02');
  });

  it('falls back to the entries when the declared date is absent or null', () => {
    expect(getStatusDate(LOG, undefined)).toBe('2026-07-24');
    expect(getStatusDate(LOG, 'null')).toBe('2026-07-24');
  });

  it('falls back to the declared date when the log has no dated entry', () => {
    expect(getStatusDate('# Status Log\n', '2026-06-24')).toBe('2026-06-24');
  });

  it('returns null when neither source carries a date', () => {
    expect(getStatusDate('# Status Log\n', 'null')).toBeNull();
  });
});
