import { getNodeChildAt } from '@flighthq/node/contract';
import type { Shape, XmlElement } from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';
import { describe, expect, it } from 'vitest';

import { createScene2DFromSvgDocument } from './svgImport.ts';
import {
  collectCssRules,
  parseStyleDeclarations,
  resolveSvgDefinitionStyle,
  resolveSvgStyle,
  resolveSvgWinding,
} from './svgStyle.ts';

describe('collectCssRules', () => {
  it('reads the rules out of every style element in the document', () => {
    const rules = collectCssRules(element('<svg><style>rect { fill: red } .a { fill: blue }</style></svg>'));
    expect(rules).toHaveLength(2);
    expect(rules.map((rule) => rule.selector)).toEqual(['rect', '.a']);
  });

  it('finds none in a document that declares no style', () => {
    expect(collectCssRules(element('<svg><rect/></svg>'))).toEqual([]);
  });
});

describe('parseStyleDeclarations', () => {
  it('reads semicolon-separated declarations and trims around the colon', () => {
    expect(parseStyleDeclarations('fill: red; stroke : blue ;')).toEqual({ fill: 'red', stroke: 'blue' });
    expect(parseStyleDeclarations('')).toEqual({});
  });
});

describe('resolveSvgDefinitionStyle', () => {
  // ★ A GRADIENT STOP IS NEVER DRAWN, so its style is resolved by this rather than by the element walk — and the colour
  // it resolves has to reach the gradient. Both authoring forms are asserted because they take different paths through
  // the cascade: `stop-color` is a presentation attribute, `style="stop-color: …"` an inline declaration.
  //
  // A CSS RULE OVER STOPS DOES NOT REACH THEM. Measured: `<style>stop { stop-color: red }</style>` leaves both stops
  // black (0x000000ff), where either form below gives red and blue. That is a real coverage gap in the definition
  // cascade rather than a choice, and it is asserted here so the gap is recorded where the next reader will see it.
  it.each([
    ['a presentation attribute', '<stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/>'],
    ['an inline style', '<stop offset="0" style="stop-color: red"/><stop offset="1" style="stop-color: blue"/>'],
  ])('resolves stop colours from %s', (_form, stops) => {
    expect(gradientStopColours(stops)).toEqual([0xff0000ff, 0x0000ffff]);
  });

  it('leaves stop colours at the initial black when only a CSS rule names them', () => {
    const commands = firstShapeCommands(
      '<svg><style>stop { stop-color: red }</style><defs><linearGradient id="g"><stop offset="0"/><stop offset="1"/></linearGradient></defs><rect width="4" height="4" fill="url(#g)"/></svg>',
    );
    expect(commands[3]).toEqual([0x000000ff, 0x000000ff]);
  });
});

describe('resolveSvgStyle', () => {
  // ★ THE PRECEDENCE IS ATTRIBUTE < CSS RULE < INLINE STYLE, and each step has to be shown separately: a test with all
  // three present proves only that inline wins, and would pass if the other two were swapped. Measured fills, packed
  // RGBA: red 0xff0000ff, green 0x008000ff, blue 0x0000ffff.
  it('lets a CSS rule beat a presentation attribute, and an inline style beat both', () => {
    expect(fillOf('<svg><rect fill="red" width="4" height="4"/></svg>')).toBe(0xff0000ff);
    expect(fillOf('<svg><style>rect { fill: green }</style><rect fill="red" width="4" height="4"/></svg>')).toBe(
      0x008000ff,
    );
    expect(
      fillOf(
        '<svg><style>rect { fill: green }</style><rect fill="red" style="fill: blue" width="4" height="4"/></svg>',
      ),
    ).toBe(0x0000ffff);
  });
});

describe('resolveSvgWinding', () => {
  // SVG spells it `evenodd`; Flight's PathWinding spells it `evenOdd`. An unreadable value falls back rather than
  // defaulting, because the fallback is the inherited winding and not a fixed one.
  it('maps the SVG spelling and falls back for absent or unreadable values', () => {
    expect(resolveSvgWinding('evenodd', 'nonZero')).toBe('evenOdd');
    expect(resolveSvgWinding(undefined, 'nonZero')).toBe('nonZero');
    expect(resolveSvgWinding('bogus', 'evenOdd')).toBe('evenOdd');
  });
});

function element(xml: string): Readonly<XmlElement> {
  const document = parseXmlDocument(xml);
  expect(document).not.toBeNull();
  return document!;
}

function gradientStopColours(stops: string): readonly unknown[] {
  const commands = firstShapeCommands(
    `<svg><defs><linearGradient id="g">${stops}</linearGradient></defs><rect width="4" height="4" fill="url(#g)"/></svg>`,
  );
  expect(commands[0]).toBe('beginGradientFill');
  return commands[3] as readonly unknown[];
}

function fillOf(xml: string): number {
  const commands = firstShapeCommands(xml);
  expect(commands[0]).toBe('beginFill');
  return commands[2] as number;
}

function firstShapeCommands(xml: string): readonly unknown[] {
  const shape = getNodeChildAt(createScene2DFromSvgDocument(xml), 0) as Shape | null;
  expect(shape).not.toBeNull();
  return shape!.data.commands;
}
