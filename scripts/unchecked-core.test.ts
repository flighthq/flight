import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseSync } from 'oxc-parser';

import type { Mutant, UncheckedFile } from './unchecked-core';
import {
  applyMutantText,
  collectExecutedLines,
  getPositionAtOffset,
  planMutants,
  rankUncheckedFiles,
  selectReachableMutants,
} from './unchecked-core';

describe('applyMutantText', () => {
  it('splices one mutant at its own offsets', () => {
    const source = 'const ok = a < b;\n';
    const [mutant] = planMutants('x.ts', source);
    expect(applyMutantText(source, mutant as Mutant)).toBe('const ok = a <= b;\n');
  });

  it('produces source that still parses, for every mutant of several real repository files', () => {
    // The invariant the whole tool rests on. A mutant that does not parse fails its vitest run for a
    // reason that has nothing to do with the tests, and the runner records that as a KILL — so a generator
    // bug would not surface as an error, it would surface as an unearned clean bill of health for the very
    // lines it mangled.
    //
    // Real files rather than a fixture, because the failure mode here is real-code shapes: optional
    // chaining, nullish coalescing, `as` casts, generics, template literals, and regex bodies full of
    // characters that look like operators. Three of them, weighted toward the largest gate scripts, so the
    // sweep is wide enough that a whole missing guard cannot hide in the gap between hand-written cases.
    let swept = 0;
    for (const name of ['order.ts', 'select.ts', 'untested.ts']) {
      const path = resolve(import.meta.dirname, name);
      const source = readFileSync(path, 'utf8');
      const mutants = planMutants(path, source);
      expect(mutants.length, name).toBeGreaterThan(10);
      swept += mutants.length;

      for (const mutant of mutants) {
        const { errors } = parseSync(path, applyMutantText(source, mutant), { lang: 'ts', sourceType: 'module' });
        expect(errors, `${name} line ${mutant.line}: ${mutant.original} → ${mutant.replacement}`).toHaveLength(0);
      }
    }
    expect(swept).toBeGreaterThan(150);
  });
});

describe('collectExecutedLines', () => {
  it('collects every line a statement spans, not just its first', () => {
    // A multi-line call expression covers the lines its arguments sit on. Recording only the opening line
    // would drop mutants on those arguments as "unreachable", which is a silent narrowing of the sweep.
    const executed = collectExecutedLines({
      s: { '0': 3 },
      statementMap: { '0': { end: { line: 12 }, start: { line: 10 } } },
    });
    expect([...executed].sort((a, b) => a - b)).toEqual([10, 11, 12]);
  });

  it('omits statements no test executed', () => {
    const executed = collectExecutedLines({
      s: { '0': 1, '1': 0 },
      statementMap: { '0': { end: { line: 4 }, start: { line: 4 } }, '1': { end: { line: 9 }, start: { line: 9 } } },
    });
    expect(executed.has(4)).toBe(true);
    expect(executed.has(9)).toBe(false);
  });
});

describe('getPositionAtOffset', () => {
  it('is one-based in both axes and restarts the column at each newline', () => {
    const source = 'a\nbb\nccc';
    expect(getPositionAtOffset(source, 0)).toEqual({ column: 1, line: 1 });
    expect(getPositionAtOffset(source, 2)).toEqual({ column: 1, line: 2 });
    expect(getPositionAtOffset(source, 3)).toEqual({ column: 2, line: 2 });
    expect(getPositionAtOffset(source, 5)).toEqual({ column: 1, line: 3 });
  });
});

describe('planMutants', () => {
  it('shifts a relational boundary rather than flipping its direction', () => {
    // Boundary-only is a deliberate narrowing: `<` → `>` dies to almost any test that exercises the
    // comparison, so it would cost a process per site to re-prove what the suite already proves.
    expect(edits('const ok = a < b;')).toEqual([['relational', '<', '<=']]);
    expect(edits('const ok = a >= b;')).toEqual([['relational', '>=', '>']]);
  });

  it('swaps equality for its negation', () => {
    expect(edits('const ok = a === b;')).toEqual([['equality', '===', '!==']]);
    expect(edits('const ok = a != b;')).toEqual([['equality', '!=', '==']]);
  });

  it('inverts arithmetic, logical, assignment, and update operators', () => {
    expect(edits('const n = a * b;')).toEqual([['arithmetic', '*', '/']]);
    expect(edits('const n = a ?? b;')).toEqual([['logical', '??', '||']]);
    expect(edits('a %= b;')).toEqual([['assignment', '%=', '*=']]);
    expect(edits('a++;')).toEqual([['update', '++', '--']]);
    expect(edits('--a;')).toEqual([['update', '--', '++']]);
  });

  it('deletes a unary negation and a unary minus, and leaves typeof alone', () => {
    expect(edits('const ok = !a;')).toEqual([['unary', '!', '']]);
    expect(edits('const n = -1;')).toEqual([['unary', '-', '']]);
    // Removing `typeof` changes the expression's type rather than the logic under test, so a kill would
    // say nothing about whether the tests pin the behavior.
    expect(edits('const t = typeof a;')).toEqual([]);
  });

  it('flips a boolean literal', () => {
    expect(edits('const ok = true;')).toEqual([['boolean', 'true', 'false']]);
  });

  it('never mutates type syntax', () => {
    // Every one of these has a mutable-looking token inside a `TS*` subtree that is erased before the code
    // runs. A mutant there either changes nothing or fails to compile, and neither is a fact about tests.
    expect(edits('type Q = true | false;')).toEqual([]);
    expect(edits('type N = A extends B ? true : false;')).toEqual([]);
    expect(edits('interface I { a: true }')).toEqual([]);
    expect(edits('declare function f(a: number): boolean;')).toEqual([]);
  });

  it('still mutates the live expression inside a cast', () => {
    // The counterweight to the rule above. `TSAsExpression` and friends are `TS*` nodes wrapping real
    // code; pruning by prefix alone would silently skip every operator behind a cast, and a
    // cast-heavy file would then report as thoroughly checked because most of it was never mutated.
    expect(edits('const n = (a + b) as number;')).toEqual([['arithmetic', '+', '-']]);
    expect(edits('const n = (a + b)!;')).toEqual([['arithmetic', '+', '-']]);
  });

  it('finds the operator token past a comment that contains the same characters', () => {
    // The gap between the operands is scanned as code, not searched as text. Splicing into the comment
    // would leave the real operator intact — a mutant that changes nothing, which survives every test and
    // reads exactly like a missing assertion.
    const source = 'const ok = a /* > */ >= b;';
    const [mutant] = planMutants('x.ts', source);
    expect(source.slice((mutant as Mutant).start, (mutant as Mutant).end)).toBe('>=');
    expect(applyMutantText(source, mutant as Mutant)).toBe('const ok = a /* > */ > b;');
  });

  it('records each mutant against the verbatim source it replaces, in source order', () => {
    // Ordering is by the OPERATOR TOKEN's offset, not by its node's — which is why `<` precedes `&&` even
    // though the logical expression encloses the comparison and starts further left. The report is a list
    // of addresses to go and read, so it has to run down the file the way a reader does.
    const source = 'const ok = a < b && c === d;';
    const mutants = planMutants('x.ts', source);
    expect(mutants.map((mutant) => mutant.original)).toEqual(['<', '&&', '===']);
    expect(mutants.every((mutant) => source.slice(mutant.start, mutant.end) === mutant.original)).toBe(true);
  });

  it('drops a mutant that would not parse, rather than emitting a syntax error as a mutant', () => {
    // Found by the sweep above, and the reason the parse filter is a rule rather than a special case.
    // `??` may not sit unparenthesized beside `||`, so rewriting either `??` of `a ?? b ?? c` is a syntax
    // error — and a mutant that fails to compile fails its vitest run for a reason that has nothing to do
    // with the tests, which the runner would score as a kill. Both arms are asserted: the chained form has
    // no mutant, the standalone form still does, so the filter cannot be satisfied by dropping `??` wholesale.
    expect(edits('const v = a ?? b ?? c;')).toEqual([]);
    expect(edits('const v = a ?? b;')).toEqual([['logical', '??', '||']]);
  });

  it('gives several identical edits on one line distinct columns', () => {
    // From the first real run: `createPlane` printed four identical `?? → ||` rows on line 26, and nothing
    // in the report distinguished four findings from one printed four times. The line number alone is not
    // an address when a line holds more than one mutant.
    const mutants = planMutants('x.ts', 'const p = { a: a ?? 0, b: b ?? 0, c: c ?? 0 };');
    expect(mutants).toHaveLength(3);
    expect(mutants.every((mutant) => mutant.line === 1)).toBe(true);
    expect(new Set(mutants.map((mutant) => mutant.column)).size).toBe(3);
  });

  it('returns nothing for a file with no mutable operator', () => {
    // Distinct from "everything was killed", and the runner reports it as such. A file the tool cannot
    // mutate has not been measured.
    expect(planMutants('x.ts', 'export const Kind = "Bitmap";\n')).toEqual([]);
  });
});

describe('rankUncheckedFiles', () => {
  it('puts the file with the most survivors first, breaking ties on path', () => {
    const survivor = {
      mutant: planMutants('x.ts', 'const ok = a < b;')[0] as Mutant,
      scope: 'sibling',
      verdict: 'survived',
    } as const;
    const files: UncheckedFile[] = [
      { path: 'b.ts', survivors: [], total: 1, unreached: 0 },
      { path: 'a.ts', survivors: [], total: 1, unreached: 0 },
      { path: 'c.ts', survivors: [survivor, survivor], total: 4, unreached: 0 },
    ];
    expect(rankUncheckedFiles(files).map((file) => file.path)).toEqual(['c.ts', 'a.ts', 'b.ts']);
  });
});

describe('selectReachableMutants', () => {
  it('keeps only the mutants sitting on a line some test executed', () => {
    const source = 'const a = 1 + 2;\nconst b = 3 * 4;\n';
    const mutants = planMutants('x.ts', source);
    expect(selectReachableMutants(mutants, new Set([2])).map((mutant) => mutant.original)).toEqual(['*']);
  });

  it('keeps nothing when no line ran, rather than defaulting to everything', () => {
    // The direction matters: defaulting an absent coverage entry to "all reachable" would spend a process
    // per mutant to rediscover what `npm run untested` already reports for free.
    const mutants = planMutants('x.ts', 'const a = 1 + 2;\n');
    expect(selectReachableMutants(mutants, new Set())).toEqual([]);
  });
});

function edits(source: string): [string, string, string][] {
  return planMutants('x.ts', source).map((mutant) => [mutant.operator, mutant.original, mutant.replacement]);
}
