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

describe('formatStatusLine changed tone', () => {
  it('gives a drifted hash a DIFFERENT glyph from a clean pass', () => {
    // The whole point: a reader scanning a wall of ticks must be able to see this one without reading
    // the message. Same-glyph-different-text is what let a changed hash read as unremarkable.
    const clean = strip(formatStatusLine('pass', 'canvas', 6, ''));
    const drifted = strip(formatStatusLine('changed', 'canvas', 6, 'changed (hash differs from baseline)'));
    expect(clean).toContain('✓');
    expect(drifted).not.toContain('✓');
    expect(drifted).toContain('±');
  });

  it('keeps the drift message visible rather than dimming it away like a routine pass', () => {
    expect(strip(formatStatusLine('changed', 'canvas', 6, 'changed (hash differs from baseline)'))).toContain(
      'changed (hash differs from baseline)',
    );
  });

  it('does not borrow the failure glyph, since a changed hash is not a failure', () => {
    expect(strip(formatStatusLine('changed', 'canvas', 6, 'x'))).not.toContain('✗');
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
