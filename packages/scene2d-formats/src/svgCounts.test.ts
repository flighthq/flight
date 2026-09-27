import { describe, expect, it } from 'vitest';

import { collectSvgCounts } from './svgCounts.ts';

describe('collectSvgCounts', () => {
  it('returns null for invalid XML', () => {
    expect(collectSvgCounts('not xml <<<<')).toBeNull();
  });

  it('returns null for non-SVG XML', () => {
    expect(collectSvgCounts('<html></html>')).toBeNull();
    expect(collectSvgCounts('<div></div>')).toBeNull();
  });

  it('counts the root svg element as a container', () => {
    const counts = collectSvgCounts('<svg></svg>');
    expect(counts).not.toBeNull();
    expect(counts!.get('container')).toBe(1);
    expect(counts!.size).toBe(1);
  });

  it('counts element kinds', () => {
    const counts = collectSvgCounts('<svg><rect width="10" height="10"/><circle r="5"/><text>hi</text></svg>')!;
    expect(counts.get('geometry')).toBe(2);
    expect(counts.get('text')).toBe(1);
  });

  it('counts container elements including the root svg', () => {
    const counts = collectSvgCounts('<svg><g><rect width="10" height="10"/></g></svg>')!;
    expect(counts.get('container')).toBe(2);
    expect(counts.get('geometry')).toBe(1);
  });

  it('counts use and image elements', () => {
    const counts = collectSvgCounts(
      '<svg><defs><rect id="r" width="10" height="10"/></defs><use href="#r"/><image href="a.png" width="10" height="10"/></svg>',
    )!;
    expect(counts.get('use')).toBe(1);
    expect(counts.get('image')).toBe(1);
  });

  it('walks nested elements', () => {
    const counts = collectSvgCounts(
      '<svg><g><g><rect width="10" height="10"/><rect width="5" height="5"/></g></g></svg>',
    )!;
    expect(counts.get('geometry')).toBe(2);
    expect(counts.get('container')).toBe(3);
  });
});
