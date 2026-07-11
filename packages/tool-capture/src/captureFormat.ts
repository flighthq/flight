// Terminal output formatting shared by the capture.ts / compare-render.ts CLIs so their progress and
// summary lines stay aligned.

import pc from 'picocolors';

export type DetailTone = 'pass' | 'fail' | 'skip' | 'muted';

// An indented detail line under an entry's [N/M] header: a status glyph, the renderer/check label
// padded to a shared column width, then an optional message. Low-level layout — the caller has already
// colored `glyph` and `message`; `paint` colors the padded label (padding happens before color so the
// invisible ANSI codes do not throw off the column width). Most callers want formatStatusLine instead.
export function formatDetailLine(
  glyph: string,
  label: string,
  labelWidth: number,
  message: string,
  paint: (s: string) => string = (s) => s,
): string {
  // Pad only when a message follows; an unpadded label avoids a trailing space (and trimEnd cannot
  // strip it once color codes wrap the padding).
  const paintedLabel = paint(message ? label.padEnd(labelWidth) : label);
  return message ? `  ${glyph} ${paintedLabel}  ${message}` : `  ${glyph} ${paintedLabel}`;
}

// The common detail line: the glyph AND the renderer/check label carry the verdict color, so the eye
// lands on *what* passed or failed rather than on a tiny glyph in a field of white. A routine
// confirmation (pass / muted) dims its message so it recedes; a fail/skip keeps the tone color on the
// message because the reason is the point.
export function formatStatusLine(tone: DetailTone, label: string, labelWidth: number, message: string): string {
  const paint = TONE_PAINT[tone];
  const body = message ? (tone === 'pass' || tone === 'muted' ? pc.dim(message) : paint(message)) : '';
  return formatDetailLine(paint(TONE_GLYPH[tone]), label, labelWidth, body, paint);
}

// Color a "<value> <label>" summary count: dim at zero (a zero is never alarming, whatever its tone),
// else green (pass) / red (fail) / yellow (warn).
export function formatSummaryCount(value: number, label: string, tone: 'pass' | 'fail' | 'warn'): string {
  const text = `${value} ${label}`;
  if (value === 0) return pc.dim(text);
  if (tone === 'fail') return pc.red(text);
  if (tone === 'warn') return pc.yellow(text);
  return pc.green(text);
}

// A run's final summary: a ✓/✗ verdict followed by count segments. `failed` drives the verdict, so a
// run that exits non-zero always leads with ✗ even if its failing count sits later in the line.
export function formatSummaryLine(failed: boolean, counts: readonly string[]): string {
  const verdict = failed ? pc.red('✗ FAILED') : pc.green('✓ ok');
  return `${verdict}   ${counts.join('   ')}`;
}

const TONE_GLYPH: Record<DetailTone, string> = { pass: '✓', fail: '✗', skip: '⊘', muted: '·' };
const TONE_PAINT: Record<DetailTone, (s: string) => string> = {
  pass: pc.green,
  fail: pc.red,
  skip: pc.yellow,
  muted: pc.dim,
};
