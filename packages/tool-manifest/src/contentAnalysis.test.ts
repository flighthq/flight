import type { AnalysisMappings } from './contentAnalysis.js';
import { contentToManifest, readContentAnalysis, validateContentAnalysis } from './contentAnalysis.js';

// A deliberately invented vocabulary: this package must work for a domain it has never heard of, so the
// fixtures name nothing real. If these tests only passed for SWF ids, the package would not be agnostic.
const analysis = {
  observations: { glyphKind: ['round', 'square'], widgetKind: ['lever'] },
  schemaVersion: 1,
  source: 'fixture.widget',
} as const;

const mappings: AnalysisMappings = {
  glyphKind: { features: { round: ['glyph.round'], square: ['glyph.square', 'glyph.corner'] }, group: 'glyphs' },
  widgetKind: { features: { lever: ['widget.lever'] }, group: 'widgets' },
};

describe('contentToManifest', () => {
  it('maps observations into the groups their mapping names', () => {
    const result = contentToManifest(analysis, mappings);
    expect(result.manifest.features).toEqual({
      glyphs: ['glyph.corner', 'glyph.round', 'glyph.square'],
      widgets: ['widget.lever'],
    });
    expect(result.unmapped).toEqual([]);
  });

  it('reports an observed id the mapping does not name instead of dropping it', () => {
    // Dropping it silently is how a build ends up without a handler the content actually needs.
    const result = contentToManifest({ ...analysis, observations: { glyphKind: ['round', 'unknown'] } }, mappings);
    expect(result.unmapped).toEqual(['glyphKind:unknown']);
    expect(result.manifest.features.glyphs).toEqual(['glyph.round']);
  });

  it('reports an entire observation kind nobody mapped', () => {
    const result = contentToManifest({ ...analysis, observations: { mysteryKind: ['a', 'b'] } }, mappings);
    expect(result.unmapped).toEqual(['mysteryKind:a', 'mysteryKind:b']);
    expect(result.manifest.features).toEqual({});
  });

  it('de-duplicates features two observations both require', () => {
    const shared: AnalysisMappings = { k: { features: { a: ['f'], b: ['f'] }, group: 'g' } };
    const result = contentToManifest({ ...analysis, observations: { k: ['a', 'b'] } }, shared);
    expect(result.manifest.features.g).toEqual(['f']);
  });
});

describe('readContentAnalysis', () => {
  it('parses a serialized analysis', () => {
    expect(readContentAnalysis(JSON.stringify(analysis)).analysis?.source).toBe('fixture.widget');
  });

  it('reports invalid JSON rather than throwing', () => {
    expect(readContentAnalysis('nope').problems[0]).toContain('not valid JSON');
  });
});

describe('validateContentAnalysis', () => {
  it('rejects a missing source', () => {
    const result = validateContentAnalysis({ observations: {}, schemaVersion: 1 });
    expect(result.problems).toContain('source must be a non-empty string');
  });

  it('rejects observation values that are not string arrays', () => {
    const result = validateContentAnalysis({ observations: { k: [1] }, schemaVersion: 1, source: 's' });
    expect(result.problems).toContain('observations.k must be an array of strings');
  });

  it('accepts a well-formed analysis', () => {
    expect(validateContentAnalysis(analysis).analysis).not.toBeNull();
  });
});
