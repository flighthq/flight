import type { Path } from '@flighthq/types/contract';
import { PathCommand } from '@flighthq/types/contract';

// The Type 2 charstring interpreter: a stack machine whose operators emit path segments.
//
// WHAT MAKES IT DIFFERENT FROM THE `glyf` READER NEXT DOOR, AND WHY THEY SHARE NO CODE: `glyf` is a
// point list to be walked, while this is a PROGRAM to be executed — with subroutine calls, a stack, and
// operators whose argument count is variable and sometimes decided by parity. Its curves are CUBIC, so
// they emit `CUBIC_CURVE_TO` where `glyf` emits the quadratic `CURVE_TO`.
//
// Operator numbers and their argument shapes are interface facts about the format — what a published
// format exists to state. The execution model here is Flight's own.
//
// THREE RULES CAUSE MOST OF THE SILENT WRONGNESS IN A READER OF THIS FORMAT, SO THEY ARE NAMED:
//
//   1. THE OPTIONAL LEADING WIDTH. The first stack-clearing operator may carry ONE extra leading argument
//      — a width delta. Detected by parity against the operator's expected argument count, never by
//      assuming presence. Getting it wrong shifts every coordinate in the glyph by one argument.
//   2. SUBROUTINE INDICES ARE BIASED, and the bias depends on how many subroutines exist. An unbiased
//      index selects a real-but-wrong subroutine, which draws plausible garbage rather than failing.
//   3. `hintmask` CARRIES INLINE DATA. It consumes a mask whose length depends on how many stems have
//      been declared — including stems declared implicitly by leaving arguments on the stack before it.
//      Miscounting desynchronises the instruction stream from that point on.

const MAX_CALL_DEPTH = 10;

// Subroutine indices are stored biased so that small negative indices are representable in one byte. The
// bias depends on the subroutine count, so it cannot be a constant.
export function cffSubroutineBias(count: number): number {
  if (count < 1240) return 107;
  if (count < 33900) return 1131;
  return 32768;
}

// Replaces `out` with one glyph's contours, in font design units. Returns false when the charstring is
// unreadable; a glyph that legitimately draws nothing returns true with an empty path, matching the
// `glyf` reader so a caller never has to know which flavor produced the source.
//
// `y` is negated on emit, exactly as the TrueType path does, so both flavors agree with the documented
// y-down convention of `Path` and `GlyphOutlineMetrics`.
export function runCffCharstring(
  out: Path,
  bytes: Readonly<Uint8Array>,
  charstring: Readonly<{ end: number; start: number }>,
  localSubrs: readonly Readonly<{ end: number; start: number }>[],
  globalSubrs: readonly Readonly<{ end: number; start: number }>[],
): boolean {
  out.commands.length = 0;
  out.data.length = 0;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const stack: number[] = [];
  const state = {
    open: false,
    stemCount: 0,
    widthParsed: false,
    x: 0,
    y: 0,
  };

  const moveTo = (x: number, y: number): void => {
    if (state.open) out.commands.push(PathCommand.CLOSE);
    out.commands.push(PathCommand.MOVE_TO);
    out.data.push(x, -y);
    state.open = true;
  };
  const lineTo = (x: number, y: number): void => {
    out.commands.push(PathCommand.LINE_TO);
    out.data.push(x, -y);
  };
  const curveTo = (x1: number, y1: number, x2: number, y2: number, x: number, y: number): void => {
    out.commands.push(PathCommand.CUBIC_CURVE_TO);
    out.data.push(x1, -y1, x2, -y2, x, -y);
  };

  // An operator that clears the stack may be preceded by the width. `expected` is how many arguments the
  // operator itself takes; anything beyond that, once, is the width and is discarded.
  const takeWidth = (expected: number): void => {
    if (!state.widthParsed) {
      state.widthParsed = true;
      if (stack.length > expected) stack.shift();
    }
  };
  // For operators taking a variable count, the width is present when the count has the wrong parity.
  const takeWidthByParity = (multiple: number): void => {
    if (!state.widthParsed) {
      state.widthParsed = true;
      if (stack.length % multiple !== 0) stack.shift();
    }
  };

  const execute = (start: number, end: number, depth: number): boolean => {
    if (depth > MAX_CALL_DEPTH) return false;
    let cursor = start;

    while (cursor < end) {
      const b0 = view.getUint8(cursor);
      cursor += 1;

      if (b0 >= 32 || b0 === 28) {
        const operand = readCffCharstringOperand(view, b0, cursor, end);
        if (operand === null) return false;
        stack.push(operand.value);
        cursor = operand.cursor;
        continue;
      }

      switch (b0) {
        case 1:
        case 3:
        case 18:
        case 23: {
          // Stem hints. Not applied — this package produces unhinted outlines — but they must be COUNTED,
          // because `hintmask` sizes its inline data from the total.
          takeWidthByParity(2);
          state.stemCount += stack.length >> 1;
          stack.length = 0;
          break;
        }
        case 19:
        case 20: {
          // Arguments still on the stack before a mask are an implicit vstem declaration.
          takeWidthByParity(2);
          state.stemCount += stack.length >> 1;
          stack.length = 0;
          cursor += (state.stemCount + 7) >> 3;
          if (cursor > end) return false;
          break;
        }
        case 21: {
          takeWidth(2);
          state.x += stack[0] ?? 0;
          state.y += stack[1] ?? 0;
          moveTo(state.x, state.y);
          stack.length = 0;
          break;
        }
        case 22: {
          takeWidth(1);
          state.x += stack[0] ?? 0;
          moveTo(state.x, state.y);
          stack.length = 0;
          break;
        }
        case 4: {
          takeWidth(1);
          state.y += stack[0] ?? 0;
          moveTo(state.x, state.y);
          stack.length = 0;
          break;
        }
        case 5: {
          for (let index = 0; index + 1 < stack.length; index += 2) {
            state.x += stack[index]!;
            state.y += stack[index + 1]!;
            lineTo(state.x, state.y);
          }
          stack.length = 0;
          break;
        }
        case 6:
        case 7: {
          // Alternating axis lines. The starting axis is the operator; each argument flips it.
          let horizontal = b0 === 6;
          for (const delta of stack) {
            if (horizontal) state.x += delta;
            else state.y += delta;
            lineTo(state.x, state.y);
            horizontal = !horizontal;
          }
          stack.length = 0;
          break;
        }
        case 8: {
          for (let index = 0; index + 5 < stack.length; index += 6) emitRelativeCurve(index, 6);
          stack.length = 0;
          break;
        }
        case 24: {
          // Curves, then exactly one closing line.
          let index = 0;
          for (; index + 5 < stack.length - 2; index += 6) emitRelativeCurve(index, 6);
          state.x += stack[index] ?? 0;
          state.y += stack[index + 1] ?? 0;
          lineTo(state.x, state.y);
          stack.length = 0;
          break;
        }
        case 25: {
          // Lines, then exactly one closing curve.
          let index = 0;
          for (; index + 1 < stack.length - 6; index += 2) {
            state.x += stack[index]!;
            state.y += stack[index + 1]!;
            lineTo(state.x, state.y);
          }
          emitRelativeCurve(index, 6);
          stack.length = 0;
          break;
        }
        case 26:
        case 27: {
          // Curves constrained to one axis at their ends. An odd leading argument is a one-off offset on
          // the other axis, applied to the first curve only.
          const vertical = b0 === 26;
          let index = 0;
          let lead = 0;
          if (stack.length % 4 === 1) {
            lead = stack[0]!;
            index = 1;
          }
          for (; index + 3 < stack.length; index += 4) {
            const x1 = state.x + (vertical ? lead : stack[index]!);
            const y1 = state.y + (vertical ? stack[index]! : lead);
            const x2 = x1 + stack[index + 1]!;
            const y2 = y1 + stack[index + 2]!;
            state.x = x2 + (vertical ? 0 : stack[index + 3]!);
            state.y = y2 + (vertical ? stack[index + 3]! : 0);
            curveTo(x1, y1, x2, y2, state.x, state.y);
            lead = 0;
          }
          stack.length = 0;
          break;
        }
        case 30:
        case 31: {
          // Curves alternating between starting horizontal and starting vertical. A trailing fifth
          // argument on the final curve supplies the otherwise-implied last coordinate.
          let horizontal = b0 === 31;
          let index = 0;
          while (index + 3 < stack.length) {
            const last = index + 8 > stack.length;
            const extra = last && stack.length - index === 5 ? stack[index + 4]! : 0;
            let x1: number;
            let y1: number;
            if (horizontal) {
              x1 = state.x + stack[index]!;
              y1 = state.y;
            } else {
              x1 = state.x;
              y1 = state.y + stack[index]!;
            }
            const x2 = x1 + stack[index + 1]!;
            const y2 = y1 + stack[index + 2]!;
            if (horizontal) {
              state.y = y2 + stack[index + 3]!;
              state.x = x2 + extra;
            } else {
              state.x = x2 + stack[index + 3]!;
              state.y = y2 + extra;
            }
            curveTo(x1, y1, x2, y2, state.x, state.y);
            horizontal = !horizontal;
            index += 4;
          }
          stack.length = 0;
          break;
        }
        case 10:
        case 29: {
          const subrs = b0 === 10 ? localSubrs : globalSubrs;
          const index = (stack.pop() ?? 0) + cffSubroutineBias(subrs.length);
          const subr = subrs[index];
          if (subr === undefined) return false;
          if (!execute(subr.start, subr.end, depth + 1)) return false;
          break;
        }
        case 11:
          return true;
        case 14: {
          takeWidth(0);
          if (state.open) out.commands.push(PathCommand.CLOSE);
          state.open = false;
          return true;
        }
        case 12: {
          // Escaped operators are arithmetic and flex variants. None is needed to produce an outline at
          // this package's fidelity, but the argument stack must still be cleared or the next operator
          // would consume values meant for this one.
          if (cursor >= end) return false;
          cursor += 1;
          stack.length = 0;
          break;
        }
        default:
          return false;
      }
    }
    return true;
  };

  // Shared by the curve operators that take plain relative triples.
  function emitRelativeCurve(index: number, _stride: number): void {
    const x1 = state.x + stack[index]!;
    const y1 = state.y + stack[index + 1]!;
    const x2 = x1 + stack[index + 2]!;
    const y2 = y1 + stack[index + 3]!;
    state.x = x2 + stack[index + 4]!;
    state.y = y2 + stack[index + 5]!;
    curveTo(x1, y1, x2, y2, state.x, state.y);
  }

  if (!execute(charstring.start, charstring.end, 0)) return false;
  // A charstring that ended without `endchar` still leaves a contour to close.
  if (state.open) out.commands.push(PathCommand.CLOSE);
  return true;
}

// Charstring numbers use a different encoding from DICT numbers: 255 is a 16.16 fixed-point value here,
// where in a DICT it is unused. Reading one with the other's rule yields plausible coordinates.
function readCffCharstringOperand(
  view: Readonly<DataView>,
  b0: number,
  cursor: number,
  end: number,
): { cursor: number; value: number } | null {
  if (b0 === 28) {
    if (cursor + 2 > end) return null;
    return { cursor: cursor + 2, value: view.getInt16(cursor) };
  }
  if (b0 <= 246) return { cursor, value: b0 - 139 };
  if (b0 <= 250) {
    if (cursor + 1 > end) return null;
    return { cursor: cursor + 1, value: (b0 - 247) * 256 + view.getUint8(cursor) + 108 };
  }
  if (b0 <= 254) {
    if (cursor + 1 > end) return null;
    return { cursor: cursor + 1, value: -(b0 - 251) * 256 - view.getUint8(cursor) - 108 };
  }
  if (cursor + 4 > end) return null;
  return { cursor: cursor + 4, value: view.getInt32(cursor) / 65536 };
}
