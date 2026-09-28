import { getNodeChildAt } from '@flighthq/node/contract';
import type { Shape } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createScene2DFromSvgDocument } from './svgImport.ts';

// Asserted through the importer: every one of these takes the import context, and the observable result is the shape
// command a gradient fill produces. A gradient that resolved but placed itself wrongly would still be a gradient, so
// the command's ramp and its presence are both read.
const RAMP = '<stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/>';

describe('createSvgGradientMatrix', () => {
  // ★ BOTH UNIT SYSTEMS HAVE TO PRODUCE A GRADIENT, which is the part a matrix bug would break silently — an
  // objectBoundingBox gradient placed in user space still fills, just with the wrong ramp position.
  it('places a gradient in both unit systems', () => {
    expect(fillCommandOf(`<defs><linearGradient id="g">${RAMP}</linearGradient></defs>`)).toBe('beginGradientFill');
    expect(
      fillCommandOf(
        `<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="10" y2="0">${RAMP}</linearGradient></defs>`,
      ),
    ).toBe('beginGradientFill');
  });
});

describe('hasZeroAreaSvgGradientBox', () => {
  // ★ A ZERO-AREA SHAPE HAS NO GRADIENT AT ALL, not an infinitely thin one. Measured: a rect of width 0 filled with a
  // gradient emits NO commands, where the same rect with width emits the gradient fill.
  it('drops the fill for a shape with no area', () => {
    const commands = shapeCommands(
      `<defs><linearGradient id="g">${RAMP}</linearGradient></defs>`,
      'width="0" height="4"',
    );
    expect(commands).toEqual([]);
  });
});

describe('parseSvgGradient', () => {
  it('reads the stop list in offset order', () => {
    const commands = shapeCommands(
      `<defs><linearGradient id="g">${RAMP}</linearGradient></defs>`,
      'width="4" height="4"',
    );
    expect(commands[3]).toEqual([0xff0000ff, 0x0000ffff]);
  });
});

describe('resolveSvgGradient', () => {
  // ★ AN UNRESOLVED REFERENCE PAINTS NOTHING, which is not the same as painting black. `fill="url(#nope)"` names a paint
  // server that does not exist, and SVG has no fallback for one, so the shape is left unfilled — measured as no commands
  // at all rather than a `beginFill`.
  it('leaves a shape unpainted when the referenced gradient does not exist', () => {
    expect(shapeCommands('', 'width="4" height="4"')).toEqual([]);
  });
});

function fillCommandOf(defs: string): unknown {
  return shapeCommands(defs, 'width="4" height="4"')[0];
}

function shapeCommands(defs: string, rectAttributes: string): readonly unknown[] {
  const shape = getNodeChildAt(
    createScene2DFromSvgDocument(`<svg>${defs}<rect ${rectAttributes} fill="url(#g)"/></svg>`),
    0,
  ) as Shape | null;
  expect(shape).not.toBeNull();
  return shape!.data.commands;
}
