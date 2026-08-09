import { findImportDiagnosticOriginMismatches, formatImportDiagnosticOriginReport } from './import-diagnostic-origins';

// Built from synthetic sources rather than the real importers, so the check keeps meaning when a
// package corrects its own origins.

describe('findImportDiagnosticOriginMismatches', () => {
  it('reports a literal origin naming a function that did not emit it', () => {
    const report = findImportDiagnosticOriginMismatches(
      'a.ts',
      `function createThing(): void {
  reportImportDiagnostic(diagnostics, Severity.Drop, 'x.y', 'createSomethingElse', {});
}`,
    );

    expect(report.checked).toBe(1);
    expect(report.mismatches).toEqual([{ emittedIn: 'createThing', file: 'a.ts', origin: 'createSomethingElse' }]);
  });

  it('accepts a literal origin naming the emitting function', () => {
    const report = findImportDiagnosticOriginMismatches(
      'a.ts',
      `function createThing(): void {
  reportImportDiagnostic(diagnostics, Severity.Drop, 'x.y', 'createThing', {});
}`,
    );

    expect(report.mismatches).toEqual([]);
    expect(report.checked).toBe(1);
  });

  it('accepts a helper naming a function that calls it', () => {
    // The contract asks for the TRUE origin rather than the wrapper, so a single-purpose helper naming
    // its caller is the shape it wants — flagging it would push authors away from the correct pattern.
    const report = findImportDiagnosticOriginMismatches(
      'a.ts',
      `function parseThing(): void {
  reportDrop(diagnostics, 'x.y');
}

function reportDrop(diagnostics, kind): void {
  reportImportDiagnostic(diagnostics, Severity.Drop, kind, 'parseThing', {});
}`,
    );

    expect(report.mismatches).toEqual([]);
  });

  it('counts a relayed origin separately instead of judging it', () => {
    const report = findImportDiagnosticOriginMismatches(
      'a.ts',
      `function reportDrop(diagnostics, kind, origin): void {
  reportImportDiagnostic(diagnostics, Severity.Drop, kind, origin, {});
}`,
    );

    // Nothing here is checkable: the value arrives from a caller, so its correctness lives there.
    expect(report.checked).toBe(0);
    expect(report.relayed).toBe(1);
    expect(report.mismatches).toEqual([]);
  });

  it('reads an origin split across several lines', () => {
    const report = findImportDiagnosticOriginMismatches(
      'a.ts',
      `function createThing(): void {
  reportImportDiagnostic(
    diagnostics,
    Severity.Drop,
    'x.y',
    'createSomethingElse',
    { count: 1 },
  );
}`,
    );

    expect(report.mismatches).toHaveLength(1);
  });

  it('separates finding nothing from having nothing to check', () => {
    const empty = findImportDiagnosticOriginMismatches('a.ts', 'export const value = 1;\n');

    // Zero mismatches over zero checks is a scan with nothing to look at, not an all-clear.
    expect(empty.mismatches).toEqual([]);
    expect(empty.checked).toBe(0);
  });
});

describe('formatImportDiagnosticOriginReport', () => {
  it('prints the checked total beside an empty finding', () => {
    const text = formatImportDiagnosticOriginReport(new Map([['pkg', { checked: 0, mismatches: [], relayed: 0 }]]));

    expect(text).toContain('0 of 0 literal origins');
  });

  it('names each mismatch and reports how many origins it could not judge', () => {
    const text = formatImportDiagnosticOriginReport(
      new Map([
        [
          'pkg',
          {
            checked: 4,
            mismatches: [{ emittedIn: 'createThing', file: 'a.ts', origin: 'createOther' }],
            relayed: 2,
          },
        ],
      ]),
    );

    expect(text).toContain('a.ts: origin createOther emitted in createThing');
    expect(text).toContain('2 origin(s) are relayed');
  });
});
