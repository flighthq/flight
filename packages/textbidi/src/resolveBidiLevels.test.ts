import { describe, expect, it } from 'vitest';

import { resolveBidiLevels } from './resolveBidiLevels';

// "שלום" — the Hebrew word (four strong-R letters).
const HEBREW = 'שלום';

// Arabic letters (bidi class AL): U+0627 Alef, U+0628 Ba, U+062A Ta, U+062B Tha, U+062C Jeem.
const ARABIC = 'ابتثج';

// Arabic-Indic digits (bidi class AN): U+0660-U+0662 (٠١٢).
const ARABIC_DIGITS = '٠١٢';

// Bidi control characters.
const LRE = '‪';
const RLE = '‫';
const PDF = '‬';
const LRO = '‭';
const RLO = '‮';
const LRI = '⁦';
const RLI = '⁧';
const FSI = '⁨';
const PDI = '⁩';

describe('resolveBidiLevels', () => {
  it('assigns level 0 to a pure-LTR string', () => {
    expect(Array.from(resolveBidiLevels('hello', 'auto'))).toEqual([0, 0, 0, 0, 0]);
  });

  it('assigns level 1 to a pure-RTL (Hebrew) string under auto base', () => {
    expect(Array.from(resolveBidiLevels(HEBREW, 'auto'))).toEqual([1, 1, 1, 1]);
  });

  it('converts Arabic-Indic digits to AN and keeps them at level 1 in an RTL paragraph (W2 bypass)', () => {
    // Arabic letters (AL) followed by Arabic-Indic digits (AN). W2 does not touch AN — only EN after
    // AL becomes AN. The AN stays AN through W3-W7 and I2 bumps it to level 2 (next even above 1).
    // But the digits are preceded by AL text so paragraph level is 1 (RTL).
    // AL AL AL AL AL AN AN AN → all RTL context.
    // After W3 AL→R, I2 on odd level: R stays level 1, AN gets level 2.
    const levels = Array.from(resolveBidiLevels(`${ARABIC}${ARABIC_DIGITS}`, 'auto'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 2, 2, 2]);
  });

  it('converts EN after AL to AN via W2 in an RTL paragraph', () => {
    // Arabic letters followed by European digits: AL AL AL AL AL EN EN EN.
    // W2: the last strong type before the ENs is AL, so EN→AN.
    // W3: AL→R. I2 on odd level: R stays 1, AN gets level 2.
    const levels = Array.from(resolveBidiLevels(`${ARABIC}123`, 'auto'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 2, 2, 2]);
  });

  it('derives an rtl paragraph from a leading strong-R character under auto', () => {
    // First strong char is Hebrew → paragraph level 1; the trailing Latin rises to level 2.
    const levels = Array.from(resolveBidiLevels(`${HEBREW} ab`, 'auto'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 2, 2]);
  });

  it('embeds an RTL run at an odd level inside an LTR paragraph', () => {
    // "hello שלום world": Latin at level 0, the Hebrew run at level 1, the joining spaces at 0.
    const levels = Array.from(resolveBidiLevels(`hello ${HEBREW} world`, 'auto'));
    expect(levels).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]);
  });

  it('gives European numbers in an RTL context an even (LTR) level above the RTL text', () => {
    // "שלום 123": the Hebrew + space stay at level 1, the digits get level 2 (EN under I2).
    const levels = Array.from(resolveBidiLevels(`${HEBREW} 123`, 'auto'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 2, 2, 2]);
  });

  it('keeps an explicit ltr base at level 0 for pure-LTR text even with a leading number', () => {
    expect(Array.from(resolveBidiLevels('12ab', 'ltr'))).toEqual([0, 0, 0, 0]);
  });

  it('keeps EN as level 0 after L via W7 in an LTR paragraph', () => {
    // "abc 123 def": all LTR paragraph. The EN digits: W7 says EN after L strong type becomes L.
    // So everything stays level 0.
    const levels = Array.from(resolveBidiLevels('abc 123 def', 'auto'));
    expect(levels).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('pushes an LRE embedding to level 2 inside an RTL paragraph (X3)', () => {
    // RTL paragraph (base 1). LRE pushes next-even = 2, PDF pops. The embedded Latin text gets
    // level 2 (LTR). The LRE/PDF themselves become BN and take surrounding levels.
    // שלום + LRE + "ab" + PDF + שלום
    // Paragraph level 1 (Hebrew leads).
    // Levels: [1,1,1,1, 1, 2,2, 1, 1,1,1,1]
    //         Hebrew    LRE  ab  PDF Hebrew
    const text = `${HEBREW}${LRE}ab${PDF}${HEBREW}`;
    const levels = Array.from(resolveBidiLevels(text, 'auto'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1]);
  });

  it('pushes an RLE embedding to level 1 inside an LTR paragraph (X2)', () => {
    // LTR paragraph (base 0). RLE pushes next-odd = 1, PDF pops. The embedded Hebrew text gets
    // level 1 (RTL). The RLE/PDF become BN at the surrounding level.
    // "ab" + RLE + שלום + PDF + "cd"
    const text = `ab${RLE}${HEBREW}${PDF}cd`;
    const levels = Array.from(resolveBidiLevels(text, 'auto'));
    // ab=0,0  RLE=0  שלום=1,1,1,1  PDF=0  cd=0,0
    expect(levels).toEqual([0, 0, 0, 1, 1, 1, 1, 0, 0, 0]);
  });

  it('raises the paragraph level for an explicit rtl base', () => {
    // Same mixed string, base 'rtl': the Latin words rise to level 2, the Hebrew + spaces sit at 1.
    const levels = Array.from(resolveBidiLevels(`hello ${HEBREW} world`, 'rtl'));
    expect(levels).toEqual([2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
  });

  it('resets trailing whitespace to the paragraph level via L1', () => {
    // Hebrew text followed by spaces: paragraph level 1, Hebrew at level 1, but the trailing
    // whitespace resets to paragraph level 1 via L1. In an RTL paragraph the WS is already at 1.
    // For an LTR paragraph with trailing WS after RTL: "abc שלום   "
    // LTR paragraph (base 0). Hebrew at level 1. Trailing spaces are WS — L1 resets them to 0.
    const levels = Array.from(resolveBidiLevels(`abc ${HEBREW}   `, 'auto'));
    // abc =0,0,0,0  שלום=1,1,1,1  "   "=0,0,0  (L1 trailing WS → paragraph level)
    expect(levels).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0]);
  });

  it('resolves an LRI isolate to an even level inside an RTL paragraph (X5b)', () => {
    // RTL paragraph. LRI pushes next-even above current level 1 = 2. The isolated Latin text
    // gets level 2. PDI pops back.
    // שלום + LRI + "ab" + PDI + שלום
    const text = `${HEBREW}${LRI}ab${PDI}${HEBREW}`;
    const levels = Array.from(resolveBidiLevels(text, 'auto'));
    // Hebrew=1,1,1,1  LRI=1  ab=2,2  PDI=1  Hebrew=1,1,1,1
    expect(levels).toEqual([1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1]);
  });

  it('resolves an RLI isolate to an odd level inside an LTR paragraph (X5a)', () => {
    // LTR paragraph. RLI pushes next-odd above current level 0 = 1. The isolated Hebrew text
    // gets level 1. PDI pops back.
    // "ab" + RLI + שלום + PDI + "cd"
    const text = `ab${RLI}${HEBREW}${PDI}cd`;
    const levels = Array.from(resolveBidiLevels(text, 'auto'));
    // ab=0,0  RLI=0  שלום=1,1,1,1  PDI=0  cd=0,0
    expect(levels).toEqual([0, 0, 0, 1, 1, 1, 1, 0, 0, 0]);
  });

  it('resolves an FSI isolate by scoring its content (X5c)', () => {
    // LTR paragraph. FSI scores the enclosed text — Hebrew is first strong, so it acts like RLI.
    // "ab" + FSI + שלום + PDI + "cd" → same as the RLI case: Hebrew at level 1.
    const text = `ab${FSI}${HEBREW}${PDI}cd`;
    const levels = Array.from(resolveBidiLevels(text, 'auto'));
    expect(levels).toEqual([0, 0, 0, 1, 1, 1, 1, 0, 0, 0]);
  });

  it('resolves an FSI with LTR content as LRI (X5c)', () => {
    // RTL paragraph. FSI scores "ab" — first strong is L, so it acts like LRI → next-even = 2.
    // שלום + FSI + "ab" + PDI + שלום
    const text = `${HEBREW}${FSI}ab${PDI}${HEBREW}`;
    const levels = Array.from(resolveBidiLevels(text, 'auto'));
    // Hebrew=1,1,1,1  FSI=1  ab=2,2  PDI=1  Hebrew=1,1,1,1
    expect(levels).toEqual([1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1]);
  });

  it('resolves mixed neutrals between same-direction strong types via N1', () => {
    // "abc!?@def": all LTR. The neutrals (ON class: !?@) sit between L and L, so N1 resolves
    // them to L. Everything stays level 0.
    const levels = Array.from(resolveBidiLevels('abc!?@def', 'auto'));
    expect(levels).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('resolves neutrals between R and R to R via N1 in an RTL paragraph', () => {
    // שלום!?שלום in an RTL paragraph. The neutrals (ON: !?) sit between R and R, so N1 resolves
    // them to R. I2 on odd level: R stays level 1. Everything is level 1.
    const levels = Array.from(resolveBidiLevels(`${HEBREW}!?${HEBREW}`, 'auto'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('resolves neutrals between opposite strong types to the embedding direction via N2', () => {
    // LTR paragraph: "abc!שלום". Neutrals (!) between L and R. N1 requires both sides same
    // direction — they differ, so N2 applies: the neutral gets the embedding direction (L at
    // level 0). The Hebrew still gets level 1.
    const levels = Array.from(resolveBidiLevels(`abc!${HEBREW}`, 'auto'));
    // abc=0,0,0  !=0  שלום=1,1,1,1
    expect(levels).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
  });

  it('resolves an LRO override forcing all content to L (X6)', () => {
    // LTR paragraph. LRO forces the override direction L onto all characters until PDF.
    // "a" + LRO + שלום + PDF + "b": the Hebrew under LRO is overridden to L class.
    // LRO pushes next-even above 0 = 2 with L override. The overridden Hebrew chars become L at
    // level 2. Then I1 on even level: L stays level 2.
    const text = `a${LRO}${HEBREW}${PDF}b`;
    const levels = Array.from(resolveBidiLevels(text, 'auto'));
    // a=0  LRO=0  שלום=2,2,2,2  PDF=0  b=0
    expect(levels).toEqual([0, 0, 2, 2, 2, 2, 0, 0]);
  });

  it('resolves an RLO override forcing all content to R (X6)', () => {
    // LTR paragraph. RLO pushes next-odd = 1 with R override. The Latin under RLO becomes R at
    // level 1.
    const text = `${HEBREW}${RLO}ab${PDF}${HEBREW}`;
    const levels = Array.from(resolveBidiLevels(text, 'auto'));
    // Paragraph is RTL (Hebrew leads). RLO pushes next-odd above 1 = 3. Override direction R.
    // "ab" under RLO: forced to R at level 3. I2 on odd level: R stays level 3.
    // Actually let me reconsider: paragraph level is 1 (RTL).
    // שלום=1,1,1,1  RLO=1  ab=3,3  PDF=1  שלום=1,1,1,1
    // RLO at level 1 pushes next-odd = 3 with R override. Content at level 3.
    expect(levels).toEqual([1, 1, 1, 1, 1, 3, 3, 1, 1, 1, 1, 1]);
  });

  it('returns an empty array for empty text', () => {
    expect(resolveBidiLevels('', 'auto')).toEqual(new Uint8Array(0));
  });
});
