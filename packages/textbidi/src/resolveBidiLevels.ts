import type { BidiClass, BidiDirection } from '@flighthq/types';

import { getBidiClassBackend } from './bidiClassBackend';

// Resolves the per-code-unit embedding levels of `text` under the Unicode Bidirectional Algorithm
// (UAX #9), returning one level per UTF-16 code unit. This is the substance of the package: the full
// explicit/weak/neutral/implicit resolution a shaper and line-layout consume.
//
// Rules implemented: P2/P3 (paragraph base level for 'auto'), X1–X8 explicit embeddings/overrides,
// X5a–X6a directional isolates (LRI/RLI/FSI/PDI with the overflow/valid isolate counters), X9 (the
// explicit formatting characters and BN are removed from weak/neutral resolution — retained here as BN
// so they keep a level for reordering), X10/BD13 (isolating run sequences with sos/eos), W1–W7 (weak
// types), N1–N2 (neutral runs), and I1–I2 (implicit levels), then L1 (reset separators and trailing
// whitespace to the paragraph level). N0 (the BD16 paired-bracket rule) is DEFERRED — mirrored
// brackets in mixed text resolve as plain neutrals (N1/N2), not paired to their content's direction;
// the full-coverage flight-rs backend / a later pass owns BD16. L2 visual reordering lives in
// reorderBidiLine.
//
// Astral characters occupy two UTF-16 code units; both units are assigned the code point's class and
// therefore resolve to the same level. `baseDirection` fixes the paragraph level ('ltr' → 0, 'rtl' →
// 1) or derives it from the first strong character ('auto', rules P2/P3).
export function resolveBidiLevels(text: string, baseDirection: BidiDirection): Uint8Array {
  const length = text.length;
  const levels = new Uint8Array(length);
  if (length === 0) return levels;

  const backend = getBidiClassBackend();
  const original: BidiClass[] = new Array(length);
  for (let i = 0; i < length; i++) {
    const codepoint = text.codePointAt(i) as number;
    const cls = backend.getBidiClass(codepoint);
    original[i] = cls;
    if (codepoint > 0xffff) {
      original[i + 1] = cls; // trailing surrogate shares the class so both units resolve alike
      i++;
    }
  }

  const paragraphLevel =
    baseDirection === 'ltr' ? 0 : baseDirection === 'rtl' ? 1 : computeParagraphLevel(original, 0, length);

  const matchingPdi = new Int32Array(length).fill(length);
  const matchingInitiator = new Int32Array(length).fill(-1);
  pairIsolates(original, matchingPdi, matchingInitiator);

  // `working` is the type array mutated by overrides (X6) and X9 removal (→ BN); the weak/neutral
  // passes read and rewrite it. `original` is preserved for BD9 isolate matching and L1.
  const working = original.slice();
  const levelArray = new Array<number>(length);
  applyExplicitLevels(original, working, levelArray, matchingPdi, paragraphLevel);
  resolveIsolatingRunSequences(original, working, levelArray, matchingPdi, matchingInitiator, paragraphLevel);
  applyLineReset(original, levelArray, paragraphLevel);

  for (let i = 0; i < length; i++) levels[i] = levelArray[i];
  return levels;
}

// P2/P3: the base embedding level from the first strong character (L → 0, R/AL → 1) in [start, end),
// skipping any characters between an isolate initiator and its matching PDI. Defaults to 0 (LTR) when
// there is no strong character. Also reused by X5c to score an FSI's enclosed text.
function computeParagraphLevel(types: readonly BidiClass[], start: number, end: number): number {
  let isolateDepth = 0;
  for (let i = start; i < end; i++) {
    const t = types[i];
    if (t === 'LRI' || t === 'RLI' || t === 'FSI') {
      isolateDepth++;
    } else if (t === 'PDI') {
      if (isolateDepth > 0) isolateDepth--;
    } else if (isolateDepth === 0) {
      if (t === 'L') return 0;
      if (t === 'R' || t === 'AL') return 1;
    }
  }
  return 0;
}

// BD9: pair each isolate initiator (LRI/RLI/FSI) with its matching PDI and vice versa. Unmatched
// initiators keep matchingPdi = length; unmatched PDIs keep matchingInitiator = -1.
function pairIsolates(types: readonly BidiClass[], matchingPdi: Int32Array, matchingInitiator: Int32Array): void {
  const stack: number[] = [];
  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    if (t === 'LRI' || t === 'RLI' || t === 'FSI') {
      stack.push(i);
    } else if (t === 'PDI' && stack.length > 0) {
      const initiator = stack.pop() as number;
      matchingPdi[initiator] = i;
      matchingInitiator[i] = initiator;
    }
  }
}

// X1–X8 + X5a–X6a: walk the directional-status stack, assigning each character its explicit embedding
// level and applying directional overrides. Explicit formatting characters and BN become BN (X9) but
// retain the assigned level. Writes into `levelArray`; mutates `working` for overrides and removal.
function applyExplicitLevels(
  original: readonly BidiClass[],
  working: BidiClass[],
  levelArray: number[],
  matchingPdi: Int32Array,
  paragraphLevel: number,
): void {
  const MAX_DEPTH = 125;
  const stackLevel: number[] = [paragraphLevel];
  const stackOverride: (BidiClass | null)[] = [null];
  const stackIsolate: boolean[] = [false];
  let overflowIsolate = 0;
  let overflowEmbedding = 0;
  let validIsolate = 0;

  for (let i = 0; i < original.length; i++) {
    const t = original[i];
    const top = stackLevel.length - 1;
    switch (t) {
      case 'RLE':
      case 'LRE':
      case 'RLO':
      case 'LRO': {
        levelArray[i] = stackLevel[top];
        working[i] = 'BN';
        const newLevel = t === 'RLE' || t === 'RLO' ? nextOdd(stackLevel[top]) : nextEven(stackLevel[top]);
        if (newLevel <= MAX_DEPTH && overflowIsolate === 0 && overflowEmbedding === 0) {
          stackLevel.push(newLevel);
          stackOverride.push(t === 'RLO' ? 'R' : t === 'LRO' ? 'L' : null);
          stackIsolate.push(false);
        } else if (overflowIsolate === 0) {
          overflowEmbedding++;
        }
        break;
      }
      case 'RLI':
      case 'LRI':
      case 'FSI': {
        levelArray[i] = stackLevel[top];
        if (stackOverride[top] !== null) working[i] = stackOverride[top] as BidiClass;
        let asRtl = t === 'RLI';
        if (t === 'FSI') asRtl = computeParagraphLevel(original, i + 1, matchingPdi[i]) === 1;
        const newLevel = asRtl ? nextOdd(stackLevel[top]) : nextEven(stackLevel[top]);
        if (newLevel <= MAX_DEPTH && overflowIsolate === 0 && overflowEmbedding === 0) {
          validIsolate++;
          stackLevel.push(newLevel);
          stackOverride.push(null);
          stackIsolate.push(true);
        } else {
          overflowIsolate++;
        }
        break;
      }
      case 'PDI': {
        if (overflowIsolate > 0) {
          overflowIsolate--;
        } else if (validIsolate > 0) {
          overflowEmbedding = 0;
          while (!stackIsolate[stackLevel.length - 1]) {
            stackLevel.pop();
            stackOverride.pop();
            stackIsolate.pop();
          }
          stackLevel.pop();
          stackOverride.pop();
          stackIsolate.pop();
          validIsolate--;
        }
        const newTop = stackLevel.length - 1;
        levelArray[i] = stackLevel[newTop];
        if (stackOverride[newTop] !== null) working[i] = stackOverride[newTop] as BidiClass;
        break;
      }
      case 'PDF': {
        if (overflowIsolate > 0) {
          // isolate overflow shields embeddings; leave the stack alone
        } else if (overflowEmbedding > 0) {
          overflowEmbedding--;
        } else if (!stackIsolate[top] && stackLevel.length >= 2) {
          stackLevel.pop();
          stackOverride.pop();
          stackIsolate.pop();
        }
        levelArray[i] = stackLevel[stackLevel.length - 1];
        working[i] = 'BN';
        break;
      }
      case 'B': {
        // X8: a paragraph separator terminates all embeddings/isolates and takes the paragraph level.
        stackLevel.length = 1;
        stackOverride.length = 1;
        stackIsolate.length = 1;
        overflowIsolate = 0;
        overflowEmbedding = 0;
        validIsolate = 0;
        levelArray[i] = paragraphLevel;
        break;
      }
      case 'BN': {
        levelArray[i] = stackLevel[top];
        break;
      }
      default: {
        // X6: every other character takes the current level and, under an active override, its type.
        levelArray[i] = stackLevel[top];
        if (stackOverride[top] !== null) working[i] = stackOverride[top] as BidiClass;
        break;
      }
    }
  }
}

// X10 + BD13: form the isolating run sequences (level runs over the non-removed characters, chained
// across matching isolate initiator/PDI pairs), compute each sequence's sos/eos boundary types, and
// resolve its weak (W1–W7), neutral (N1–N2), and implicit (I1–I2) levels.
function resolveIsolatingRunSequences(
  original: readonly BidiClass[],
  working: BidiClass[],
  levelArray: number[],
  matchingPdi: Int32Array,
  matchingInitiator: Int32Array,
  paragraphLevel: number,
): void {
  const length = original.length;

  // Reduced sequence: character indices surviving X9 (everything but BN). Level runs and the "previous
  // / next character" boundaries are all defined over this reduced order.
  const kept: number[] = [];
  for (let i = 0; i < length; i++) if (working[i] !== 'BN') kept.push(i);
  if (kept.length === 0) return;

  // Level runs: maximal spans of the reduced sequence sharing one level. Each run records its member
  // indices plus its position within `kept` (to find neighbours for sos/eos).
  const runs: { indices: number[]; keptStart: number; keptEnd: number }[] = [];
  let runStart = 0;
  for (let k = 1; k <= kept.length; k++) {
    if (k === kept.length || levelArray[kept[k]] !== levelArray[kept[runStart]]) {
      const indices: number[] = [];
      for (let m = runStart; m < k; m++) indices.push(kept[m]);
      runs.push({ indices, keptStart: runStart, keptEnd: k });
      runStart = k;
    }
  }

  const runByFirst = new Map<number, number>();
  for (let r = 0; r < runs.length; r++) runByFirst.set(runs[r].indices[0], r);

  for (let r = 0; r < runs.length; r++) {
    const firstIdx = runs[r].indices[0];
    // A run is a sequence start unless it begins with a PDI that matches an isolate initiator (that
    // PDI's run is a continuation of the initiator's sequence).
    if (original[firstIdx] === 'PDI' && matchingInitiator[firstIdx] !== -1) continue;

    const sequence: number[] = [];
    let keptStart = runs[r].keptStart;
    let keptEnd = runs[r].keptEnd;
    let current = r;
    for (;;) {
      const run = runs[current];
      for (let m = 0; m < run.indices.length; m++) sequence.push(run.indices[m]);
      keptEnd = run.keptEnd;
      const lastIdx = run.indices[run.indices.length - 1];
      const lastType = original[lastIdx];
      if ((lastType === 'LRI' || lastType === 'RLI' || lastType === 'FSI') && matchingPdi[lastIdx] < length) {
        const next = runByFirst.get(matchingPdi[lastIdx]);
        if (next === undefined) break;
        current = next;
      } else {
        break;
      }
    }

    resolveSequence(original, working, levelArray, kept, sequence, keptStart, keptEnd, matchingPdi, paragraphLevel);
  }
}

// Resolves one isolating run sequence in place: computes sos/eos, runs W1–W7 / N1–N2 / I1–I2 over the
// sequence's characters in logical order, and writes the final implicit levels into `levelArray`.
function resolveSequence(
  original: readonly BidiClass[],
  working: BidiClass[],
  levelArray: number[],
  kept: readonly number[],
  sequence: readonly number[],
  keptStart: number,
  keptEnd: number,
  matchingPdi: Int32Array,
  paragraphLevel: number,
): void {
  const seqLevel = levelArray[sequence[0]];

  const prevLevel = keptStart > 0 ? levelArray[kept[keptStart - 1]] : paragraphLevel;
  const sos = Math.max(seqLevel, prevLevel) % 2 === 1 ? 'R' : 'L';
  const lastIdx = sequence[sequence.length - 1];
  const lastType = original[lastIdx];
  const endsUnmatchedIsolate =
    (lastType === 'LRI' || lastType === 'RLI' || lastType === 'FSI') && matchingPdi[lastIdx] >= original.length;
  const nextLevel = endsUnmatchedIsolate
    ? paragraphLevel
    : keptEnd < kept.length
      ? levelArray[kept[keptEnd]]
      : paragraphLevel;
  const eos = Math.max(seqLevel, nextLevel) % 2 === 1 ? 'R' : 'L';

  const len = sequence.length;
  const ty: BidiClass[] = new Array(len);
  for (let k = 0; k < len; k++) ty[k] = working[sequence[k]];

  // W1: resolve NSM to the type of the previous character (sos at the start); an NSM after an isolate
  // initiator or PDI becomes ON.
  let prev: BidiClass = sos;
  for (let k = 0; k < len; k++) {
    if (ty[k] === 'NSM') {
      ty[k] = prev === 'LRI' || prev === 'RLI' || prev === 'FSI' || prev === 'PDI' ? 'ON' : prev;
    }
    prev = ty[k];
  }

  // W2: an EN after an AL strong type becomes AN.
  let strong: BidiClass = sos;
  for (let k = 0; k < len; k++) {
    const c = ty[k];
    if (c === 'L' || c === 'R' || c === 'AL') strong = c;
    else if (c === 'EN' && strong === 'AL') ty[k] = 'AN';
  }

  // W3: AL becomes R.
  for (let k = 0; k < len; k++) if (ty[k] === 'AL') ty[k] = 'R';

  // W4: a single ES between two ENs, or a single CS between two numbers of the same type, joins them.
  for (let k = 1; k < len - 1; k++) {
    const c = ty[k];
    if (c === 'ES' && ty[k - 1] === 'EN' && ty[k + 1] === 'EN') ty[k] = 'EN';
    else if (c === 'CS') {
      if (ty[k - 1] === 'EN' && ty[k + 1] === 'EN') ty[k] = 'EN';
      else if (ty[k - 1] === 'AN' && ty[k + 1] === 'AN') ty[k] = 'AN';
    }
  }

  // W5: a run of ET adjacent to an EN becomes EN.
  for (let k = 0; k < len; ) {
    if (ty[k] === 'ET') {
      let j = k;
      while (j < len && ty[j] === 'ET') j++;
      const before = k > 0 ? ty[k - 1] : sos;
      const after = j < len ? ty[j] : eos;
      if (before === 'EN' || after === 'EN') for (let m = k; m < j; m++) ty[m] = 'EN';
      k = j;
    } else {
      k++;
    }
  }

  // W6: any remaining separator/terminator (ES/ET/CS) becomes ON.
  for (let k = 0; k < len; k++) if (ty[k] === 'ES' || ty[k] === 'ET' || ty[k] === 'CS') ty[k] = 'ON';

  // W7: an EN after an L strong type becomes L.
  strong = sos;
  for (let k = 0; k < len; k++) {
    const c = ty[k];
    if (c === 'L' || c === 'R') strong = c;
    else if (c === 'EN' && strong === 'L') ty[k] = 'L';
  }

  // N1: a run of neutral/isolate-formatting characters between two characters of the same direction
  // (L, or R with EN/AN counting as R) takes that direction. N2: any remainder takes the embedding
  // direction. (N0 bracket pairing is deferred — see resolveBidiLevels.)
  const embeddingDir: BidiClass = seqLevel % 2 === 1 ? 'R' : 'L';
  for (let k = 0; k < len; ) {
    if (isNeutralOrIsolate(ty[k])) {
      let j = k;
      while (j < len && isNeutralOrIsolate(ty[j])) j++;
      const before = k > 0 ? neutralDirection(ty[k - 1]) : sos;
      const after = j < len ? neutralDirection(ty[j]) : eos;
      const resolved = before === after ? before : embeddingDir;
      for (let m = k; m < j; m++) ty[m] = resolved;
      k = j;
    } else {
      k++;
    }
  }

  // I1/I2: implicit levels. Even embedding level: R → +1, AN/EN → +2. Odd embedding level: L/EN/AN → +1.
  const even = seqLevel % 2 === 0;
  for (let k = 0; k < len; k++) {
    const c = ty[k];
    let lvl = seqLevel;
    if (even) {
      if (c === 'R') lvl = seqLevel + 1;
      else if (c === 'AN' || c === 'EN') lvl = seqLevel + 2;
    } else if (c === 'L' || c === 'EN' || c === 'AN') {
      lvl = seqLevel + 1;
    }
    levelArray[sequence[k]] = lvl;
  }
}

// L1: reset the level of segment/paragraph separators, and of any whitespace / isolate-formatting /
// removed run preceding a separator or the end of the paragraph, back to the paragraph level. Uses the
// original types (the reset set is defined on them, before resolution).
function applyLineReset(original: readonly BidiClass[], levelArray: number[], paragraphLevel: number): void {
  const length = original.length;
  for (let i = 0; i < length; i++) {
    const t = original[i];
    if (t === 'B' || t === 'S') {
      levelArray[i] = paragraphLevel;
      for (let j = i - 1; j >= 0 && isResetType(original[j]); j--) levelArray[j] = paragraphLevel;
    }
  }
  for (let j = length - 1; j >= 0 && isResetType(original[j]); j--) levelArray[j] = paragraphLevel;
}

// The N1/N2 "neutral or isolate" set (NI): the characters resolved by the neutral rules.
function isNeutralOrIsolate(t: BidiClass): boolean {
  return t === 'B' || t === 'S' || t === 'WS' || t === 'ON' || t === 'FSI' || t === 'LRI' || t === 'RLI' || t === 'PDI';
}

// The L1 reset set: whitespace, isolate formatting, and the X9-removed explicit formatting / BN
// characters that trail a separator or the line.
function isResetType(t: BidiClass): boolean {
  return (
    t === 'WS' ||
    t === 'LRI' ||
    t === 'RLI' ||
    t === 'FSI' ||
    t === 'PDI' ||
    t === 'LRE' ||
    t === 'RLE' ||
    t === 'LRO' ||
    t === 'RLO' ||
    t === 'PDF' ||
    t === 'BN'
  );
}

// Direction a resolved strong/number character contributes at a neutral-run boundary (N1): L stays L;
// R, EN, and AN all count as R.
function neutralDirection(t: BidiClass): 'L' | 'R' {
  return t === 'L' ? 'L' : 'R';
}

// Least even level strictly greater than `level` (for LTR embeddings/isolates, X3/X5b).
function nextEven(level: number): number {
  return (level + 2) & ~1;
}

// Least odd level strictly greater than `level` (for RTL embeddings/isolates, X2/X5a).
function nextOdd(level: number): number {
  return (level + 1) | 1;
}
