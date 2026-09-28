import { SvgClipKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { svgPathClipHandler } from './svgClip.ts';
import { registerSvgClipHandlers, svgAllClipHandlers } from './svgClipHandlers.ts';
import { createSvgRegistry } from './svgRegistry.ts';

// The handler's own test asserts that the preset installs it for its kind. What is left here is what only the family can
// answer: that the family is exactly this one member, and that installing it touches no other registry.
describe('registerSvgClipHandlers', () => {
  it('registers the clip-path kind alone, and no element handlers', () => {
    const registry = createSvgRegistry();
    registerSvgClipHandlers(registry);
    expect(registry.clipHandlers.map((entry) => entry.kind)).toEqual([SvgClipKind.Path]);
    expect(registry.elementHandlers).toEqual([]);
  });
});

describe('svgAllClipHandlers', () => {
  it('contains every built-in clip handler', () => {
    expect(svgAllClipHandlers).toEqual([svgPathClipHandler]);
  });
});
