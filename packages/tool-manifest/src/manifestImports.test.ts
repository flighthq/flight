import { createManifest } from './manifest.js';
import type { ManifestImportRegistry } from './manifestImports.js';
import { resolveManifestImports } from './manifestImports.js';

const registry: ManifestImportRegistry = {
  glyphs: {
    'glyph.round': { binding: 'roundGlyphs', module: '@example/glyphs', spread: true },
    'glyph.square': { binding: 'squareGlyph', module: '@example/glyphs' },
  },
  widgets: { 'widget.lever': { binding: 'leverWidget', module: '@example/widgets' } },
};

describe('resolveManifestImports', () => {
  it('resolves every required feature to its entry', () => {
    const resolution = resolveManifestImports(
      createManifest({ glyphs: ['glyph.round', 'glyph.square'], widgets: ['widget.lever'] }),
      registry,
    );
    expect(resolution.missing).toEqual([]);
    expect(resolution.entries.glyphs?.map((entry) => entry.binding)).toEqual(['roundGlyphs', 'squareGlyph']);
    expect(resolution.entries.widgets?.map((entry) => entry.binding)).toEqual(['leverWidget']);
  });

  it('reports a feature the registry cannot place instead of omitting it', () => {
    // Silently omitting it generates a file missing a feature the content needs — the exact failure
    // this pipeline exists to prevent, and one nothing downstream could detect.
    const resolution = resolveManifestImports(createManifest({ glyphs: ['glyph.unknown'] }), registry);
    expect(resolution.missing).toEqual(['glyphs:glyph.unknown']);
  });

  it('reports every id of a group the registry never declares', () => {
    const resolution = resolveManifestImports(createManifest({ mystery: ['a'] }), registry);
    expect(resolution.missing).toEqual(['mystery:a']);
  });

  it('resolves nothing for an empty manifest', () => {
    expect(resolveManifestImports(createManifest(), registry)).toEqual({ entries: {}, missing: [] });
  });
});
