import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { findDataCastColourViolations, findDataCastTargets } from './data-cast-colour';

describe('findDataCastColourViolations', () => {
  it('reports no colour-carrying cast target in the repository', () => {
    expect(findDataCastColourViolations(REPO_ROOT)).toEqual([]);
  });

  it('finds a colour field introduced by a new cast target', () => {
    const text = [
      'interface AcmeTintedData {',
      '  readonly authoredBounds: Rectangle;',
      '  tint: number;',
      '}',
      'const data = shape.data as unknown as AcmeTintedData;',
    ].join('\n');

    expect(findColourFieldsIn(text)).toEqual([{ field: 'tint', typeName: 'AcmeTintedData' }]);
  });

  it('does not report a cast target that carries only geometry', () => {
    const text = [
      'interface AcmeBoundsData {',
      '  readonly authoredBounds: Rectangle;',
      '}',
      'const data = shape.data as AcmeBoundsData;',
    ].join('\n');

    expect(findColourFieldsIn(text)).toEqual([]);
  });

  // The window defect this whole check descends from: a fixed-size context read attributes the NEXT
  // declaration's fields to the interface above it. Matching to the balanced closing brace is what makes
  // the empty body read as empty.
  it('does not attribute the following declaration to an empty cast target', () => {
    const text = [
      'interface AcmeEmptyData extends ShapeData {}',
      '',
      'interface AcmeColorTransform {',
      '  redMultiplier: number;',
      '}',
      'const data = shape.data as AcmeEmptyData;',
    ].join('\n');

    expect(findColourFieldsIn(text)).toEqual([]);
  });
});

describe('findDataCastTargets', () => {
  it('reads both the direct and the double-cast form', () => {
    const text = ['a.data as AcmeOne;', 'b.data as unknown as AcmeTwo;'].join('\n');

    expect(findDataCastTargets(text)).toEqual(['AcmeOne', 'AcmeTwo']);
  });

  it('drops wrappers and the empty type, which declare no fields of their own', () => {
    const text = ['a.data as object;', 'b.data as Partial;', 'c.data as Readonly;', 'd.data as AcmeReal;'].join('\n');

    expect(findDataCastTargets(text)).toEqual(['AcmeReal']);
  });
});

// Exercises the same resolution the repository scan uses — interface bodies matched to their balanced
// brace, cast targets resolved against them — without writing fixture files to disk.
function findColourFieldsIn(text: string): { field: string; typeName: string }[] {
  const bodies = new Map<string, string>();
  for (const match of text.matchAll(/interface (\w+)[^{]*\{/g)) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) {
          bodies.set(match[1]!, text.slice(open + 1, i));
          break;
        }
      }
    }
  }

  const found: { field: string; typeName: string }[] = [];
  for (const typeName of findDataCastTargets(text)) {
    const body = bodies.get(typeName);
    if (body === undefined) continue;
    for (const line of body.split('\n')) {
      const match = line.match(/(?:readonly\s+)?(\w*(?:colou?r|tint)\w*)\s*\??\s*:/i);
      if (match?.[1] !== undefined) {
        found.push({ field: match[1], typeName });
        break;
      }
    }
  }
  return found;
}

const REPO_ROOT = join(import.meta.dirname, '..');
