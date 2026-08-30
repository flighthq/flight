import { describe, expect, it } from 'vitest';

import {
  areLogSinkCleanupAuditReportsSemanticallyEqual,
  collectLogSinkCleanupAuditEnforcementErrors,
} from './audit-log-sink-cleanup';

describe('areLogSinkCleanupAuditReportsSemanticallyEqual', () => {
  it('ignores only line-number movement in every-registration rows', () => {
    const moved = REPORT.replace('| 10, 20 |', '| 410, 920 |').replace('| 3 |', '| 13 |');
    expect(areLogSinkCleanupAuditReportsSemanticallyEqual(REPORT, moved)).toBe(true);
  });

  it('rejects an added or removed registration row', () => {
    const added = REPORT.replace(PAGE_ROW, `${PAGE_ROW}\n${FINALLY_ROW.replace('packages/a.ts', 'packages/b.ts')}`);
    const removed = REPORT.replace(`${FINALLY_ROW}\n`, '');
    expect(areLogSinkCleanupAuditReportsSemanticallyEqual(REPORT, added)).toBe(false);
    expect(areLogSinkCleanupAuditReportsSemanticallyEqual(REPORT, removed)).toBe(false);
  });

  it('rejects path, count, classification, and consequence changes', () => {
    expect(
      areLogSinkCleanupAuditReportsSemanticallyEqual(REPORT, REPORT.replace('packages/a.ts', 'packages/renamed.ts')),
    ).toBe(false);
    expect(
      areLogSinkCleanupAuditReportsSemanticallyEqual(REPORT, REPORT.replace('| 10, 20 | 2 |', '| 10, 20 | 1 |')),
    ).toBe(false);
    expect(
      areLogSinkCleanupAuditReportsSemanticallyEqual(REPORT, REPORT.replace('`finally-cleanup`', '`direct-cleanup`')),
    ).toBe(false);
    expect(
      areLogSinkCleanupAuditReportsSemanticallyEqual(
        REPORT,
        REPORT.replace(FINALLY_CONSEQUENCE, 'Different ownership meaning.'),
      ),
    ).toBe(false);
  });

  it('rejects summary bucket and table-header drift', () => {
    expect(
      areLogSinkCleanupAuditReportsSemanticallyEqual(
        REPORT,
        REPORT.replace('2 locally bracketed', '1 locally bracketed'),
      ),
    ).toBe(false);
    expect(
      areLogSinkCleanupAuditReportsSemanticallyEqual(
        REPORT,
        REPORT.replace('| File | Lines | Count |', '| Source | Lines | Count |'),
      ),
    ).toBe(false);
  });
});

describe('collectLogSinkCleanupAuditEnforcementErrors', () => {
  it('still rejects an unexpected missing-cleanup registration', () => {
    expect(
      collectLogSinkCleanupAuditEnforcementErrors([
        PAGE_LIFETIME_REGISTRATION,
        { argument: 'sink', classification: 'missing-cleanup', line: 10, path: 'packages/a.ts' },
      ]),
    ).toEqual(['1 addLogSink registration(s) have no guaranteed cleanup.']);
  });

  it('still requires exactly one page-lifetime exception', () => {
    expect(collectLogSinkCleanupAuditEnforcementErrors([])).toEqual([
      'Expected exactly one page-lifetime size-fixture registration, found 0.',
    ]);
    expect(
      collectLogSinkCleanupAuditEnforcementErrors([PAGE_LIFETIME_REGISTRATION, PAGE_LIFETIME_REGISTRATION]),
    ).toEqual(['Expected exactly one page-lifetime size-fixture registration, found 2.']);
  });
});

const FINALLY_CONSEQUENCE = 'Guaranteed on success and failure.';
const FINALLY_ROW = '| `packages/a.ts` | 10, 20 | 2 | `finally-cleanup` | Guaranteed on success and failure. |';
const PAGE_ROW =
  '| `tools/size/fixtures/log-console/src/render.canvas.ts` | 3 | 1 | `missing-cleanup` | Document lifetime. |';
const REPORT = `# \`addLogSink\` cleanup audit

The current tree contains **3 registrations across 2 files**: 2 locally bracketed by \`finally\`, 0 cleared by failure-safe test hooks, 0 immediately removed/replaced, 0 owned by an explicit API lifetime, and 1 without a shorter-lifetime cleanup.

## Every registration

| File | Lines | Count | Classification | Consequence |
| --- | --- | ---: | --- | --- |
${FINALLY_ROW}
${PAGE_ROW}
`;
const PAGE_LIFETIME_REGISTRATION = {
  argument: 'createConsoleLogSink()',
  classification: 'missing-cleanup' as const,
  line: 3,
  path: 'tools/size/fixtures/log-console/src/render.canvas.ts',
};
