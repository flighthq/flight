import type { XmlElement } from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';
import { describe, expect, it } from 'vitest';

import { createSvgGeometryPath } from './svgGeometryPath.ts';

describe('createSvgGeometryPath', () => {
  // ★ THE COMMAND LIST IS THE ASSERTION, because "a path came back" is true of every one of these and says nothing
  // about which element was read. Measured: a rect closes (7) after four edges, a circle is four curves (6) and a
  // close, a polygon closes its three edges, and `<path>` carries whatever its data says — here one moveTo and one
  // lineTo, with no close.
  it('reads each geometry element into the commands that element implies', () => {
    expect(commandsOf('<rect width="4" height="4"/>')).toEqual([1, 2, 2, 2, 7]);
    expect(commandsOf('<circle r="3"/>')).toEqual([1, 6, 6, 6, 6, 7]);
    expect(commandsOf('<polygon points="0,0 4,0 4,4"/>')).toEqual([1, 2, 2, 7]);
    expect(commandsOf('<path d="M0 0 L5 5"/>')).toEqual([1, 2]);
  });

  // ★ NULL IS HOW THE DISPATCH TELLS A SHAPE FROM A GROUP. The element families key on kind, but clipping walks raw
  // children and has to decide element by element whether there is geometry to collect — so "not a geometry element"
  // has to be a value rather than an empty path, which would contribute an empty region.
  it('answers null for an element that is not geometry', () => {
    expect(createSvgGeometryPath(element('<g/>'), 'nonZero')).toBeNull();
    expect(createSvgGeometryPath(element('<text/>'), 'nonZero')).toBeNull();
  });

  it('carries the winding it is given onto the path', () => {
    expect(createSvgGeometryPath(element('<rect width="4" height="4"/>'), 'evenOdd')!.winding).toBe('evenOdd');
    expect(createSvgGeometryPath(element('<rect width="4" height="4"/>'), 'nonZero')!.winding).toBe('nonZero');
  });
});

function commandsOf(xml: string): readonly number[] {
  const path = createSvgGeometryPath(element(xml), 'nonZero');
  expect(path).not.toBeNull();
  return path!.commands;
}

function element(xml: string): Readonly<XmlElement> {
  const document = parseXmlDocument(xml);
  expect(document).not.toBeNull();
  return document!;
}
