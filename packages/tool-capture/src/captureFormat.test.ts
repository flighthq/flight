import { describe, expect, it } from 'vitest';

import { formatDetailLine, formatStatusLine, formatSummaryCount, formatSummaryLine } from './captureFormat';

// picocolors emits ANSI codes only on a color-capable TTY; strip them so assertions hold regardless of
// the environment's color support.
// eslint-disable-next-line no-control-regex -- ESC (0x1b) is required to strip ANSI color codes
const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('formatDetailLine', () => {
  it('omits label padding when there is no message', () => {
    expect(strip(formatDetailLine('✓', 'canvas', 10, ''))).toBe('  ✓ canvas');
  });

  it('pads the label to the column width when a message follows', () => {
    expect(strip(formatDetailLine('✓', 'canvas', 10, 'ok'))).toBe('  ✓ canvas      ok');
  });
});

describe('formatStatusLine', () => {
  it('uses the tone glyph for the verdict', () => {
    expect(strip(formatStatusLine('pass', 'webgl', 6, ''))).toBe('  ✓ webgl');
    expect(strip(formatStatusLine('fail', 'webgl', 6, 'boom'))).toContain('✗ webgl');
    expect(strip(formatStatusLine('skip', 'webgl', 6, 'nope'))).toContain('⊘ webgl');
    expect(strip(formatStatusLine('muted', 'webgl', 6, ''))).toContain('· webgl');
  });

  it('keeps the message alongside the label', () => {
    expect(strip(formatStatusLine('fail', 'webgl', 6, 'boom'))).toContain('boom');
  });
});

describe('formatSummaryCount', () => {
  it('formats a value/label pair', () => {
    expect(strip(formatSummaryCount(3, 'captured', 'pass'))).toBe('3 captured');
    expect(strip(formatSummaryCount(0, 'failed', 'fail'))).toBe('0 failed');
  });
});

describe('formatSummaryLine', () => {
  it('leads with the verdict then joins the counts', () => {
    expect(strip(formatSummaryLine(false, ['3 captured', '0 failed']))).toBe('✓ ok   3 captured   0 failed');
    expect(strip(formatSummaryLine(true, ['1 failed']))).toBe('✗ FAILED   1 failed');
  });
});
