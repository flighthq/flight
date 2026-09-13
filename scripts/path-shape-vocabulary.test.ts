import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');
const DETECTOR_FILE = 'scripts/path-shape-vocabulary.test.ts';
const RETIRED_KEY_NEGATIVE_TEST_FILE = 'packages/shape-formats/src/shapeJson.test.ts';
const RETIRED_KEY_NEGATIVE_TEST_SOURCE =
  "it.each(['curveTo', 'drawRoundRectangle'])('returns null for retired command key %s', (key) => {";

const RETIRED_EXPORTED_NAMES = [
  'appendPathArcTo',
  'appendPathCurveTo',
  'appendPathEllipticalArc',
  'appendPathRoundRectangle',
  'appendShapeArcTo',
  'appendShapeCurveTo',
  'appendShapeEllipticalArc',
  'appendShapeRoundRectangle',
  'appendShapeRoundRectangleVarying',
  'defaultCanvasCurveTo',
  'defaultCanvasDrawRoundRectangle',
  'defaultGlCurveTo',
  'defaultGlDrawRoundRectangle',
  'defaultShapeBoundsCurveTo',
  'defaultWgpuCurveTo',
  'defaultWgpuDrawRoundRectangle',
] as const;

const RETIRED_KIND_AND_COMMAND_NAMES = ['CURVE_TO', 'curveTo', 'drawRoundRectangle'] as const;
const RETIRED_SCHEMA_FIELDS = [
  'control1X',
  'control1Y',
  'control2X',
  'control2Y',
  'ellipseHeight',
  'ellipseWidth',
] as const;
const RETIRED_ENDPOINT_FIELDS = ['anchorX', 'anchorY'] as const;

describe('path and shape vocabulary', () => {
  it('exempts native Canvas methods without hiding Flight vocabulary beside them', () => {
    const source = [
      'context.quadraticCurveTo(1, 2, 3, 4);',
      'ctx.bezierCurveTo(1, 2, 3, 4, 5, 6);',
      'context.roundRect(1, 2, 3, 4, 5);',
      'appendShapeCurveTo(shape, 1, 2, 3, 4);',
    ].join('\n');

    expect(stripAllowedNativeCanvasMethods(source)).toBe(
      '(1, 2, 3, 4);\n(1, 2, 3, 4, 5, 6);\n(1, 2, 3, 4, 5);\nappendShapeCurveTo(shape, 1, 2, 3, 4);',
    );
  });

  it('distinguishes Path and Shape command vocabulary from unrelated curve helpers', () => {
    expect(
      isPathShapeKindOrCommandReference('packages/font-formats/src/cffCharstring.ts', 'const curveTo = 1;', 'curveTo'),
    ).toBe(false);
    expect(
      isPathShapeKindOrCommandReference(
        'packages/font-formats/src/openTypeGlyf.ts',
        'path.commands.push(PathCommand.CURVE_TO);',
        'CURVE_TO',
      ),
    ).toBe(true);
    expect(isPathShapeKindOrCommandReference('packages/example/src/fixture.ts', "['curveTo']", 'curveTo')).toBe(true);
  });

  it('exempts only the explicit retired-key fixture and still catches the same keys in production', () => {
    expect(
      isRetiredKeyNegativeFixture(RETIRED_KEY_NEGATIVE_TEST_FILE, RETIRED_KEY_NEGATIVE_TEST_SOURCE, 'curveTo'),
    ).toBe(true);
    expect(
      isRetiredKeyNegativeFixture(
        RETIRED_KEY_NEGATIVE_TEST_FILE,
        RETIRED_KEY_NEGATIVE_TEST_SOURCE,
        'drawRoundRectangle',
      ),
    ).toBe(true);
    expect(
      collectMatchingLineViolations(
        RETIRED_KIND_AND_COMMAND_NAMES,
        [{ file: RETIRED_KEY_NEGATIVE_TEST_FILE, line: 1, text: RETIRED_KEY_NEGATIVE_TEST_SOURCE }],
        isPathShapeKindOrCommandReference,
      ),
    ).toStrictEqual([]);
    expect(
      collectMatchingLineViolations(
        RETIRED_KIND_AND_COMMAND_NAMES,
        [
          {
            file: 'packages/shape-formats/src/shapeJson.ts',
            line: 1,
            text: 'const handlers = { curveTo, drawRoundRectangle };',
          },
        ],
        isPathShapeKindOrCommandReference,
      ),
    ).toStrictEqual([
      'packages/shape-formats/src/shapeJson.ts:1:curveTo',
      'packages/shape-formats/src/shapeJson.ts:1:drawRoundRectangle',
    ]);
  });

  it('keeps retired exported APIs out of the repository', () => {
    expect(collectViolations(RETIRED_EXPORTED_NAMES)).toStrictEqual([]);
  }, 30_000);

  it('keeps retired kinds and command keys out of the repository', () => {
    expect(collectViolations(RETIRED_KIND_AND_COMMAND_NAMES, isPathShapeKindOrCommandReference)).toStrictEqual([]);
  }, 30_000);

  it('keeps retired segment and command-schema fields out of path and shape vocabulary', () => {
    expect([
      ...collectViolations(RETIRED_SCHEMA_FIELDS),
      ...collectViolations(RETIRED_ENDPOINT_FIELDS, isPathShapeVocabularyFile),
    ]).toStrictEqual([]);
  }, 30_000);
});

function collectViolations(
  names: readonly string[],
  includesMatch: (file: string, text: string, name: string) => boolean = () => true,
): string[] {
  return collectMatchingLineViolations(names, matchingLines(), includesMatch);
}

function collectMatchingLineViolations(
  names: readonly string[],
  lines: ReadonlyArray<{ file: string; line: number; text: string }>,
  includesMatch: (file: string, text: string, name: string) => boolean = () => true,
): string[] {
  const pattern = new RegExp(`\\b(?:${names.map(escapeRegularExpression).join('|')})\\b`, 'gu');
  const violations: string[] = [];
  for (const { file, line, text } of lines) {
    const source = stripAllowedNativeCanvasMethods(text);
    for (const match of source.matchAll(pattern)) {
      const name = match[0];
      if (includesMatch(file, source, name)) violations.push(`${file}:${line}:${name}`);
    }
  }
  return violations.sort();
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function isPathShapeVocabularyFile(file: string): boolean {
  return (
    file.startsWith('packages/path/') ||
    file.startsWith('packages/path-formats/') ||
    file.startsWith('packages/scene2d-canvas/') ||
    file.startsWith('packages/shape/') ||
    file.startsWith('packages/shape-formats/') ||
    [
      'packages/types/src/Path.ts',
      'packages/types/src/PathSegment.ts',
      'packages/types/src/ShapeBounds.ts',
      'packages/types/src/ShapeCommand.ts',
    ].includes(file)
  );
}

function isPathShapeKindOrCommandReference(file: string, text: string, name: string): boolean {
  if (isRetiredKeyNegativeFixture(file, text, name)) return false;
  if (isPathShapeVocabularyFile(file)) return true;
  if (name === 'CURVE_TO' && /\bPathCommand\.CURVE_TO\b/u.test(text)) return true;
  return new RegExp(`(['"\\x60])${escapeRegularExpression(name)}\\1`, 'u').test(text);
}

function isRetiredKeyNegativeFixture(file: string, text: string, name: string): boolean {
  return (
    file === RETIRED_KEY_NEGATIVE_TEST_FILE &&
    text.trim() === RETIRED_KEY_NEGATIVE_TEST_SOURCE &&
    (name === 'curveTo' || name === 'drawRoundRectangle')
  );
}

function matchingLines(): Array<{ file: string; line: number; text: string }> {
  if (_matchingLines !== null) return _matchingLines;
  const names = [
    ...RETIRED_EXPORTED_NAMES,
    ...RETIRED_KIND_AND_COMMAND_NAMES,
    ...RETIRED_SCHEMA_FIELDS,
    ...RETIRED_ENDPOINT_FIELDS,
  ];
  const result = spawnSync('git', ['grep', '-nE', names.map(escapeExtendedRegularExpression).join('|')], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf-8',
  });
  if (result.status !== 0 && result.stdout === '') return (_matchingLines = []);

  return (_matchingLines = result.stdout
    .split('\n')
    .filter((row) => row !== '')
    .map(parseGitGrepRow)
    .filter(({ file }) => !file.startsWith('agents/') && file !== DETECTOR_FILE));
}

function escapeExtendedRegularExpression(value: string): string {
  return value.replace(/[.\\[\]{}()*+?^$|]/gu, '\\$&');
}

function parseGitGrepRow(row: string): { file: string; line: number; text: string } {
  const fileSeparator = row.indexOf(':');
  const lineSeparator = row.indexOf(':', fileSeparator + 1);
  return {
    file: row.slice(0, fileSeparator),
    line: Number(row.slice(fileSeparator + 1, lineSeparator)),
    text: row.slice(lineSeparator + 1),
  };
}

// Flight deliberately follows different names from the browser canvas API. Native calls remain valid
// and are removed by expression, not by directory, so a retired Flight name beside one is still found.
function stripAllowedNativeCanvasMethods(source: string): string {
  return source.replace(/\b(?:context|ctx)\.(?:bezierCurveTo|quadraticCurveTo|roundRect)\b/gu, '');
}

let _matchingLines: Array<{ file: string; line: number; text: string }> | null = null;
