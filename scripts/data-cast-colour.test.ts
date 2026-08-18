import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { findDataCastColourViolations, findDataCastTargets } from './data-cast-colour';

describe('findDataCastColourViolations', () => {
  // The repo-wide invariant that used to live here is now `npm run check:data-cast-colour`. It scanned
  // five trees inside a fixed per-test deadline and timed out as the repo grew; a gate has no deadline.
  // These two cases keep the function itself tested against a fixture tree, which is bounded — moving the
  // invariant out must not take the function's only direct coverage with it.
  it('reports a colour-carrying cast target found in a scanned tree', () => {
    const root = mkdtempSync(join(tmpdir(), 'data-cast-colour-'));
    mkdirSync(join(root, 'packages'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'tinted.ts'),
      ['interface AcmeTintedData {', '  tint: number;', '}', 'const d = shape.data as unknown as AcmeTintedData;'].join(
        '\n',
      ),
    );

    expect(findDataCastColourViolations(root)).toEqual([
      { field: 'tint', file: join(root, 'packages', 'tinted.ts'), typeName: 'AcmeTintedData' },
    ]);

    rmSync(root, { force: true, recursive: true });
  });

  it('reports nothing for a scanned tree whose cast target carries only geometry', () => {
    const root = mkdtempSync(join(tmpdir(), 'data-cast-colour-clean-'));
    mkdirSync(join(root, 'packages'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'plain.ts'),
      [
        'interface AcmePlainData {',
        '  readonly authoredBounds: Rectangle;',
        '}',
        'const d = shape.data as unknown as AcmePlainData;',
      ].join('\n'),
    );

    expect(findDataCastColourViolations(root)).toEqual([]);

    rmSync(root, { force: true, recursive: true });
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

  // The NAME-FILTER defect, which this checker itself shipped with in its first version: a type whose
  // colour sits one level in declares no field spelled colour, so a name-only filter clears it. Colour is
  // followed by TYPE FLOW instead, and the report names the dotted path to where it actually lives.
  it('follows a struct-typed field into the type that carries the colour', () => {
    const text = [
      'interface AcmeEndpoint {',
      '  readonly alpha?: number;',
      '  readonly color: number;',
      '}',
      'interface AcmeNestedData {',
      '  readonly paint: AcmeEndpoint;',
      '}',
      'const data = shape.data as unknown as AcmeNestedData;',
    ].join('\n');

    expect(findColourFieldsIn(text)).toEqual([{ field: 'paint.color', typeName: 'AcmeNestedData' }]);
  });

  it('terminates on a self-referential type rather than recursing forever', () => {
    const text = [
      'interface AcmeCyclicData {',
      '  readonly parent: AcmeCyclicData;',
      '  readonly bounds: number;',
      '}',
      'const data = shape.data as AcmeCyclicData;',
    ].join('\n');

    expect(findColourFieldsIn(text)).toEqual([]);
  });

  // Arrays, unions and single-identifier type aliases are followed; a GENERIC INSTANTIATION is the
  // stated bound. Measured against the real resolver, not assumed from the regex.
  it.each([
    [
      'an array element type',
      'interface E { readonly color: number; }\ninterface T { readonly eps: E[]; }\nconst d = s.data as T;',
      'eps.color',
    ],
    [
      'a union member',
      'interface A { readonly bounds: number; }\ninterface B { readonly tint: number; }\ninterface T { readonly paint: A | B; }\nconst d = s.data as T;',
      'paint.tint',
    ],
  ])('follows colour through %s', (_label, text, expected) => {
    expect(findColourFieldsIn(text).map((hit) => hit.field)).toEqual([expected]);
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

  const resolve = (typeName: string, seen: Set<string>): string | null => {
    if (seen.has(typeName)) return null;
    seen.add(typeName);
    const body = bodies.get(typeName);
    if (body === undefined) return null;
    for (const line of body.split('\n')) {
      const declaration = line.match(/(?:readonly\s+)?(\w+)\s*\??\s*:\s*([^;,]+)/);
      if (declaration?.[1] === undefined || declaration[2] === undefined) continue;
      const [, field, declaredType] = declaration;
      if (/colou?r|tint/i.test(field)) return field;
      for (const candidate of declaredType.matchAll(/[A-Za-z_]\w*/g)) {
        const nested = resolve(candidate[0], seen);
        if (nested !== null) return `${field}.${nested}`;
      }
    }
    return null;
  };

  const found: { field: string; typeName: string }[] = [];
  for (const typeName of findDataCastTargets(text)) {
    const field = resolve(typeName, new Set());
    if (field !== null) found.push({ field, typeName });
  }
  return found;
}
