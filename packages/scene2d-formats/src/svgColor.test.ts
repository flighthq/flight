import { describe, expect, it } from 'vitest';

import { parseSvgColor, resolveSvgColor } from './svgColor.ts';

describe('parseSvgColor', () => {
  // ★ EVERY FORM HAS TO LAND ON THE SAME GREEN, because SVG lets an author write one colour four ways and a document
  // mixing them must not shade differently depending on which spelling it used.
  it('reads hex, rgb, hsl and the named table onto one value', () => {
    expect(parseSvgColor('#ff0000')).toEqual({ alpha: 1, rgb: 0xff0000 });
    expect(parseSvgColor('rgb(0,255,0)')).toEqual({ alpha: 1, rgb: 0x00ff00 });
    expect(parseSvgColor('hsl(120,100%,50%)')).toEqual({ alpha: 1, rgb: 0x00ff00 });
    expect(parseSvgColor('red')).toEqual({ alpha: 1, rgb: 0xff0000 });
  });

  // ★ `none` AND A BAD COLOUR BOTH ANSWER NULL, AND THAT IS DELIBERATE RATHER THAN LOSSY. Either way there is nothing
  // to paint with, and the caller's behaviour — leave the shape unfilled — is the same, so a second sentinel would be
  // a distinction no caller could act on.
  it('answers null for none and for a colour it cannot read', () => {
    expect(parseSvgColor('none')).toBeNull();
    expect(parseSvgColor('nonsense')).toBeNull();
  });
});

describe('resolveSvgColor', () => {
  // `currentColor` is the one colour that cannot be read from its own text: it defers to the cascade's `color`.
  it('defers currentColor to the inherited colour and reads anything else directly', () => {
    expect(resolveSvgColor('currentColor', '#0000ff')).toEqual({ alpha: 1, rgb: 0x0000ff });
    expect(resolveSvgColor('#ff0000', '#0000ff')).toEqual({ alpha: 1, rgb: 0xff0000 });
  });
});
