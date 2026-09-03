import { EntityRuntimeKey, PathCommand } from '@flighthq/types/contract';
import type { Path } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { cffSubroutineBias, runCffCharstring } from './cffCharstring';

function createPath(): Path {
  return { [EntityRuntimeKey]: undefined, commands: [], data: [], winding: 'evenOdd' };
}

// Charstrings are assembled as raw operator/operand bytes. One-byte operands cover -107..107, which is
// the whole range these fixtures need, so `n(v)` is the encoding rather than a helper hiding one.
function n(value: number): number {
  return value + 139;
}

function run(...bytes: number[]): { ok: boolean; path: Path } {
  const buffer = new Uint8Array(bytes);
  const path = createPath();
  return { ok: runCffCharstring(path, buffer, { end: buffer.length, start: 0 }, [], []), path };
}

describe('cffSubroutineBias', () => {
  // The bias depends on the pool size, so it cannot be a constant. An unbiased index selects a
  // real-but-wrong subroutine, which draws plausible garbage rather than failing.
  it('steps at the two thresholds the format defines', () => {
    expect(cffSubroutineBias(0)).toBe(107);
    expect(cffSubroutineBias(1239)).toBe(107);
    expect(cffSubroutineBias(1240)).toBe(1131);
    expect(cffSubroutineBias(33899)).toBe(1131);
    expect(cffSubroutineBias(33900)).toBe(32768);
  });
});

describe('runCffCharstring', () => {
  it('writes the winding rather than leaving whatever the caller had', () => {
    // Seeded with the wrong rule for the same reason as the glyf reader's twin test: a fresh path
    // already defaults to nonZero, so only a deliberately wrong seed can show the field is written.
    // `createPath` in this file already seeds the WRONG rule, so every fixture here was positioned
    // to expose this and nothing had asserted on it.
    const { path } = run(n(10), n(20), 21, 14);
    expect(path.winding).toBe('nonZero');
  });

  it('emits a move and closes on endchar', () => {
    const { ok, path } = run(n(10), n(20), 21, 14);
    expect(ok).toBe(true);
    expect(path.commands).toEqual([PathCommand.MOVE_TO, PathCommand.CLOSE]);
    // y is negated at this seam, matching the glyf reader so both flavors agree with Path's y-down rule.
    expect(path.data).toEqual([10, -20]);
  });

  it('draws relative lines', () => {
    const { path } = run(n(0), n(0), 21, n(50), n(0), n(0), n(60), 5, 14);
    expect(path.commands).toEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO, PathCommand.CLOSE]);
    expect(path.data).toEqual([0, -0, 50, -0, 50, -60]);
  });

  it('alternates the axis for hlineto and vlineto', () => {
    const { path } = run(n(0), n(0), 21, n(10), n(20), n(30), 6, 14);
    // Starts horizontal, then flips per argument: x+10, y+20, x+30.
    expect(path.data).toEqual([0, -0, 10, -0, 10, -20, 40, -20]);
  });

  it('emits a cubic curve, which is what distinguishes this flavor from glyf', () => {
    const { path } = run(n(0), n(0), 21, n(10), n(0), n(10), n(10), n(0), n(10), 8, 14);
    expect(path.commands).toEqual([PathCommand.MOVE_TO, PathCommand.CUBIC_CURVE_TO, PathCommand.CLOSE]);
    expect(path.data).toEqual([0, -0, 10, -0, 20, -10, 20, -20]);
  });

  // THE OPTIONAL LEADING WIDTH. Present on the first stack-clearing operator only, detected by argument
  // count rather than assumed. Getting it wrong shifts every coordinate in the glyph by one argument.
  it('drops a leading width argument on the first stack-clearing operator', () => {
    const withWidth = run(n(99), n(10), n(20), 21, 14).path;
    const without = run(n(10), n(20), 21, 14).path;
    expect(withWidth.data).toEqual(without.data);
  });

  it('does not treat a later extra argument as a width', () => {
    // Second rmoveto: three arguments would be malformed, but the width has already been consumed, so
    // the first two are the move and nothing is silently dropped from the coordinates.
    const { path } = run(n(10), n(20), 21, n(5), n(5), 21, 14);
    expect(path.data.slice(0, 2)).toEqual([10, -20]);
    expect(path.data.slice(2, 4)).toEqual([15, -25]);
  });

  it('opens a new contour on a second move and closes the first', () => {
    const { path } = run(n(0), n(0), 21, n(10), n(0), 5, n(50), n(50), 21, n(10), n(0), 5, 14);
    expect(path.commands.filter((command) => command === PathCommand.MOVE_TO)).toHaveLength(2);
    expect(path.commands.filter((command) => command === PathCommand.CLOSE)).toHaveLength(2);
  });

  // hintmask carries inline data whose length depends on the declared stem count, INCLUDING stems
  // declared implicitly by leaving arguments on the stack. Miscounting desynchronises everything after.
  it('skips the hintmask bytes implied by the stem count', () => {
    // Two stems declared explicitly, then hintmask with its one mask byte, then a line.
    const { ok, path } = run(n(0), n(0), n(10), n(10), 1, n(0), n(0), 21, 19, 0xff, n(10), n(0), 5, 14);
    expect(ok).toBe(true);
    expect(path.commands).toEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.CLOSE]);
  });

  it('counts stems declared implicitly before a hintmask', () => {
    // Nine implicit stems need two mask bytes; reading one would desynchronise the stream.
    const args = [
      n(0),
      n(0),
      n(1),
      n(1),
      n(2),
      n(2),
      n(3),
      n(3),
      n(4),
      n(4),
      n(5),
      n(5),
      n(6),
      n(6),
      n(7),
      n(7),
      n(8),
      n(8),
    ];
    const { ok, path } = run(n(0), n(0), 21, ...args, 19, 0xff, 0xff, n(10), n(0), 5, 14);
    expect(ok).toBe(true);
    expect(path.commands).toEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.CLOSE]);
  });

  it('calls a local subroutine and returns', () => {
    const subr = new Uint8Array([n(10), n(0), 5, 11]);
    // Bias for a pool of one is 107, so the stored index must be -107 to select entry 0. Pushing 0 here
    // would select entry 107 and fail — which is the bias doing its job.
    const main = new Uint8Array([n(0), n(0), 21, n(-107), 10, 14]);
    const bytes = new Uint8Array(main.length + subr.length);
    bytes.set(main);
    bytes.set(subr, main.length);
    const path = createPath();
    const ok = runCffCharstring(
      path,
      bytes,
      { end: main.length, start: 0 },
      [{ end: bytes.length, start: main.length }],
      [],
    );
    expect(ok).toBe(true);
    expect(path.commands).toEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.CLOSE]);
  });

  it('returns false for a subroutine index the pool does not have', () => {
    expect(run(n(0), n(0), 21, n(50), 10, 14).ok).toBe(false);
  });

  it('returns false for an unknown operator rather than guessing its arity', () => {
    expect(run(n(0), n(0), 21, 2, 14).ok).toBe(false);
  });

  it('returns true with an empty path for a charstring that draws nothing', () => {
    const { ok, path } = run(14);
    expect(ok).toBe(true);
    expect(path.commands).toEqual([]);
  });

  it('replaces the previous contents of out rather than appending', () => {
    const buffer = new Uint8Array([n(0), n(0), 21, n(10), n(0), 5, 14]);
    const path = createPath();
    runCffCharstring(path, buffer, { end: buffer.length, start: 0 }, [], []);
    const first = path.commands.length;
    runCffCharstring(path, buffer, { end: buffer.length, start: 0 }, [], []);
    expect(path.commands).toHaveLength(first);
  });

  it('closes an unterminated contour rather than leaving it open', () => {
    const { ok, path } = run(n(0), n(0), 21, n(10), n(0), 5);
    expect(ok).toBe(true);
    expect(path.commands[path.commands.length - 1]).toBe(PathCommand.CLOSE);
  });
});
