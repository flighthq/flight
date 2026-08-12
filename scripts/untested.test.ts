import { collectUntestedBranches, extractArmText, rankUntestedFiles } from './untested';

const SOURCE = ['const first = 1;', 'if (a > b && c) return -1;', 'const last = 2;'].join('\n');
const LINES = SOURCE.split('\n');

describe('collectUntestedBranches', () => {
  it('reports only the arms whose execution count is zero', () => {
    const branches = collectUntestedBranches(
      {
        b: { '0': [3, 0], '1': [1, 1] },
        branchMap: {
          '0': {
            line: 2,
            locations: [{ start: { column: 4, line: 2 } }, { start: { column: 9, line: 2 } }],
            type: 'if',
          },
          '1': {
            line: 3,
            locations: [{ start: { column: 0, line: 3 } }, { start: { column: 6, line: 3 } }],
            type: 'if',
          },
        },
      },
      SOURCE,
    );

    expect(branches).toHaveLength(1);
    expect(branches[0].line).toBe(2);
    expect(branches[0].index).toBe(2);
  });

  it('quotes the source line verbatim rather than describing it', () => {
    const branches = collectUntestedBranches(
      { b: { '0': [0] }, branchMap: { '0': { line: 2, locations: [{ start: { column: 4, line: 2 } }], type: 'if' } } },
      SOURCE,
    );

    expect(branches[0].sourceLine).toBe('if (a > b && c) return -1;');
  });

  // v8 leaves the arm location off entirely for implicit else arms — 12 of geometry's 131 at the time
  // this was written. The entry must survive on the branch's own line rather than being dropped, or the
  // list would silently under-report exactly the arms nobody has looked at.
  it('falls back to the branch location when the arm has none', () => {
    const branches = collectUntestedBranches(
      { b: { '0': [1, 0] }, branchMap: { '0': { loc: { start: { column: 0, line: 2 } }, type: 'if' } } },
      SOURCE,
    );

    expect(branches).toHaveLength(1);
    expect(branches[0].line).toBe(2);
    expect(branches[0].armText).toBeNull();
  });

  it('sorts by line, then by arm index', () => {
    const branches = collectUntestedBranches(
      {
        b: { '0': [0], '1': [0, 0] },
        branchMap: {
          '0': { line: 3, locations: [{ start: { column: 0, line: 3 } }], type: 'if' },
          '1': {
            line: 1,
            locations: [{ start: { column: 0, line: 1 } }, { start: { column: 6, line: 1 } }],
            type: 'binary-expr',
          },
        },
      },
      SOURCE,
    );

    expect(branches.map((branch) => [branch.line, branch.index])).toEqual([
      [1, 1],
      [1, 2],
      [3, 1],
    ]);
  });
});

describe('extractArmText', () => {
  it('returns the exact source slice for a complete single-line range', () => {
    expect(extractArmText(LINES, { end: { column: 14, line: 2 }, start: { column: 4, line: 2 } })).toBe('a > b && c');
  });

  // The whole point of the degrade path. v8 leaves `end.column` null on most arms; slicing anyway would
  // produce a confident, wrong quotation, and a reader who catches the tool inventing text once will not
  // trust the locations either. Every case below must yield null so the caller prints the raw line alone.
  it.each([
    ['a null end column', { end: { column: null, line: 2 }, start: { column: 4, line: 2 } }],
    ['a missing end', { end: null, start: { column: 4, line: 2 } }],
    ['a null start column', { end: { column: 13, line: 2 }, start: { column: null, line: 2 } }],
    ['a missing location', undefined],
    ['a range spanning lines', { end: { column: 2, line: 3 }, start: { column: 4, line: 2 } }],
    ['a zero-width range', { end: { column: 4, line: 2 }, start: { column: 4, line: 2 } }],
    ['a line past the end of file', { end: { column: 3, line: 99 }, start: { column: 0, line: 99 } }],
  ])('degrades to null for %s', (_case, location) => {
    expect(extractArmText(LINES, location)).toBeNull();
  });

  it('degrades to null when the range holds only whitespace', () => {
    expect(
      extractArmText(['if (a) {   } else {}'], { end: { column: 11, line: 1 }, start: { column: 8, line: 1 } }),
    ).toBeNull();
  });
});

describe('rankUntestedFiles', () => {
  it('puts the file with the most unexamined arms first', () => {
    const ranked = rankUntestedFiles([
      { branches: [{ armText: null, index: 1, line: 1, sourceLine: '', type: 'if' }], path: 'b.ts' },
      {
        branches: [
          { armText: null, index: 1, line: 1, sourceLine: '', type: 'if' },
          { armText: null, index: 2, line: 2, sourceLine: '', type: 'if' },
        ],
        path: 'a.ts',
      },
    ]);

    expect(ranked.map((file) => file.path)).toEqual(['a.ts', 'b.ts']);
  });

  it('breaks ties on path so repeated runs print the same order', () => {
    const one = { branches: [{ armText: null, index: 1, line: 1, sourceLine: '', type: 'if' }], path: 'z.ts' };
    const two = { branches: [{ armText: null, index: 1, line: 1, sourceLine: '', type: 'if' }], path: 'a.ts' };

    expect(rankUntestedFiles([one, two]).map((file) => file.path)).toEqual(['a.ts', 'z.ts']);
    expect(rankUntestedFiles([two, one]).map((file) => file.path)).toEqual(['a.ts', 'z.ts']);
  });

  it('does not mutate the input array', () => {
    const files = [
      { branches: [{ armText: null, index: 1, line: 1, sourceLine: '', type: 'if' }], path: 'z.ts' },
      {
        branches: [
          { armText: null, index: 1, line: 1, sourceLine: '', type: 'if' },
          { armText: null, index: 2, line: 2, sourceLine: '', type: 'if' },
        ],
        path: 'a.ts',
      },
    ];

    rankUntestedFiles(files);

    expect(files.map((file) => file.path)).toEqual(['z.ts', 'a.ts']);
  });
});
