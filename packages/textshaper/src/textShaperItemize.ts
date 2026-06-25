import type { ShapedRun, TextFormat, TextItem, TextShaperOptions } from '@flighthq/types';

import { shapeTextRun } from './textShaperRun';

// Splits `text` into contiguous runs that share a single script and direction. Each item carries
// start/end UTF-16 code-unit offsets into the original string, the inferred ISO 15924 script tag,
// and the text direction.
//
// This is a built-in Unicode-property fallback covering Latin/RTL detection and major script
// splits. For full bidi correctness (Unicode Bidirectional Algorithm), complex-script joining, and
// language-specific alternates, use a full-glyph backend such as @flighthq/textshaper-harfbuzz.
//
// The base direction from `options.direction` is used when no strong bidi character is found.
export function itemizeText(
  text: string,
  format: Readonly<TextFormat>,
  options?: Readonly<TextShaperOptions>,
): readonly TextItem[] {
  if (text.length === 0) return [];
  const baseDirection = options?.direction ?? 'LeftToRight';
  const items: TextItem[] = [];
  let runStart = 0;
  let runScript = '';
  let runDirection = baseDirection;
  for (let i = 0; i < text.length; ) {
    const codePoint = text.codePointAt(i) ?? 0;
    const charLen = codePoint > 0xffff ? 2 : 1;
    const charScript = getCodePointScript(codePoint);
    const charBidi = getCodePointBidiClass(codePoint);
    // Determine effective direction for this code point.
    let charDirection: TextItem['direction'];
    if (charBidi === 'rtl') {
      charDirection = 'RightToLeft';
    } else if (charBidi === 'ltr') {
      charDirection = 'LeftToRight';
    } else {
      charDirection = runDirection; // inherit neutral chars into current run
    }
    // Resolve script: neutral/common characters inherit the current run's script.
    const effectiveScript = charScript === 'Zyyy' ? runScript || 'Latn' : charScript;
    if (i === 0) {
      // Initialize first run.
      runScript = effectiveScript;
      runDirection = charDirection;
    } else if (effectiveScript !== runScript || charDirection !== runDirection) {
      // Script or direction changed: close current run, open a new one.
      if (i > runStart) {
        items.push({ direction: runDirection, end: i, script: runScript, start: runStart });
      }
      runStart = i;
      runScript = effectiveScript;
      runDirection = charDirection;
    }
    i += charLen;
  }
  // Close the final run.
  if (text.length > runStart) {
    items.push({
      direction: runDirection,
      end: text.length,
      script: runScript,
      start: runStart,
    });
  }
  return items;
}

// Itemizes `text` into script/direction runs and then shapes each run through the active backend,
// returning an array of ShapedRuns in logical order. Returns an empty array when no backend is
// registered or the backend is advances-only (canvas tier).
//
// This is the primary convenience entry point for multi-script strings: `itemizeText` handles the
// script/direction split, then `shapeTextRun` produces glyph ids and positions for each sub-run.
export function shapeTextRuns(
  text: string,
  format: Readonly<TextFormat>,
  options?: Readonly<TextShaperOptions>,
): readonly ShapedRun[] {
  if (text.length === 0) return [];
  const items = itemizeText(text, format, options);
  const result: ShapedRun[] = [];
  for (const item of items) {
    const sub = text.slice(item.start, item.end);
    const runOptions = {
      ...options,
      // ShapeRunOptions models only horizontal direction; vertical (TopToBottom) maps to undefined
      // (unspecified) and the shaper falls back to its default.
      direction: item.direction === 'TopToBottom' ? undefined : item.direction,
      script: item.script,
    };
    const run = shapeTextRun(sub, format, runOptions);
    if (run !== null) result.push(run);
  }
  return result;
}

// Returns the Unicode bidi category for a single code point. The result is a simplified category
// sufficient for first-level itemization (RTL/strong-RTL detection). Does not implement the full
// Unicode Bidirectional Algorithm — that requires a full ICU or unicode-bidi implementation which
// belongs in a future @flighthq/textshaper-harfbuzz or @flighthq/textshaper-icu backend.
function getCodePointBidiClass(codePoint: number): 'ltr' | 'neutral' | 'rtl' {
  // Arabic (U+0600–U+06FF, U+0750–U+077F, U+08A0–U+08FF, U+FB50–U+FDFF, U+FE70–U+FEFF)
  if (
    (codePoint >= 0x0600 && codePoint <= 0x06ff) ||
    (codePoint >= 0x0750 && codePoint <= 0x077f) ||
    (codePoint >= 0x08a0 && codePoint <= 0x08ff) ||
    (codePoint >= 0xfb50 && codePoint <= 0xfdff) ||
    (codePoint >= 0xfe70 && codePoint <= 0xfeff)
  )
    return 'rtl';
  // Hebrew (U+0590–U+05FF, U+FB1D–U+FB4F)
  if ((codePoint >= 0x0590 && codePoint <= 0x05ff) || (codePoint >= 0xfb1d && codePoint <= 0xfb4f)) return 'rtl';
  // Thaana (U+0780–U+07BF), N'Ko (U+07C0–U+07FF), Samaritan (U+0800–U+083F)
  if (codePoint >= 0x0780 && codePoint <= 0x083f) return 'rtl';
  // Syriac (U+0700–U+074F), Mandaic (U+0840–U+085F)
  if ((codePoint >= 0x0700 && codePoint <= 0x074f) || (codePoint >= 0x0840 && codePoint <= 0x085f)) return 'rtl';
  // ASCII letters/digits: LTR
  if (
    (codePoint >= 0x0041 && codePoint <= 0x005a) ||
    (codePoint >= 0x0061 && codePoint <= 0x007a) ||
    (codePoint >= 0x0030 && codePoint <= 0x0039)
  )
    return 'ltr';
  // Latin extended, Greek, Cyrillic, CJK: LTR
  if (codePoint >= 0x00c0 && codePoint <= 0x02ff) return 'ltr';
  if (codePoint >= 0x0370 && codePoint <= 0x04ff) return 'ltr';
  if (codePoint >= 0x4e00 && codePoint <= 0x9fff) return 'ltr';
  // Everything else: neutral (punctuation, whitespace, symbols)
  return 'neutral';
}

// Returns a simplified ISO 15924 script tag for a code point. This is not a complete Unicode
// script property lookup; it covers the most common scripts for first-pass itemization. A full
// implementation belongs in a HarfBuzz/ICU-backed shaper.
function getCodePointScript(codePoint: number): string {
  if (codePoint >= 0x0041 && codePoint <= 0x007a) return 'Latn';
  if (codePoint >= 0x00c0 && codePoint <= 0x024f) return 'Latn';
  if (codePoint >= 0x0370 && codePoint <= 0x03ff) return 'Grek';
  if (codePoint >= 0x0400 && codePoint <= 0x04ff) return 'Cyrl';
  if (codePoint >= 0x0590 && codePoint <= 0x05ff) return 'Hebr';
  if (codePoint >= 0x0600 && codePoint <= 0x06ff) return 'Arab';
  if (codePoint >= 0x0700 && codePoint <= 0x074f) return 'Syrc';
  if (codePoint >= 0x0900 && codePoint <= 0x097f) return 'Deva';
  if (codePoint >= 0x0e00 && codePoint <= 0x0e7f) return 'Thai';
  if (codePoint >= 0x3040 && codePoint <= 0x309f) return 'Hira';
  if (codePoint >= 0x30a0 && codePoint <= 0x30ff) return 'Kana';
  if (codePoint >= 0x4e00 && codePoint <= 0x9fff) return 'Hans';
  if (codePoint >= 0xac00 && codePoint <= 0xd7af) return 'Hang';
  return 'Zyyy'; // Common script
}
