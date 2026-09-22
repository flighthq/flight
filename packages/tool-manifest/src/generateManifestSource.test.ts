import ts from 'typescript';

import { generateManifestSource } from './generateManifestSource.js';

const entries = {
  glyphs: [
    { binding: 'roundGlyphs', module: '@example/glyphs', spread: true },
    { binding: 'squareGlyph', module: '@example/glyphs' },
  ],
  widgets: [{ binding: 'leverWidget', module: '@example/widgets' }],
};

describe('generateManifestSource', () => {
  it('emits real imports, so the bundler still sees the module graph', () => {
    // A data blob would make "an unused feature is absent from the build" a tree-shaker inference
    // rather than a property of the graph, which is the whole reason for generating code at all.
    const source = generateManifestSource(entries);
    expect(source).toContain("import { roundGlyphs, squareGlyph } from '@example/glyphs';");
    expect(source).toContain("import { leverWidget } from '@example/widgets';");
  });

  it('spreads a binding marked as an array and names one that is not', () => {
    expect(generateManifestSource(entries)).toContain('export const glyphs = [...roundGlyphs, squareGlyph];');
  });

  it('converts a dotted group id into a valid binding name', () => {
    const source = generateManifestSource({ 'swf.tags': [{ binding: 'a', module: 'm' }] });
    expect(source).toContain('export const swfTags = [a];');
  });

  it('is deterministic, so a regenerated file diffs cleanly', () => {
    const shuffled = { widgets: entries.widgets, glyphs: entries.glyphs };
    expect(generateManifestSource(shuffled)).toBe(generateManifestSource(entries));
  });

  it('emits a parseable module for empty input', () => {
    expect(generateManifestSource({})).toBe('\n');
  });

  // Ground truth the string assertions above cannot give: the emitted text is handed to the TypeScript
  // parser itself. "Valid TypeScript" is the contract, so a parser is the only honest oracle for it.
  it('emits source the TypeScript parser accepts', () => {
    for (const source of [
      generateManifestSource(entries),
      generateManifestSource({}),
      generateManifestSource({ 'swf.tags': [{ binding: 'a', module: 'm' }] }),
      generateManifestSource(entries, { banner: ['// generated'] }),
    ]) {
      const parsed = ts.createSourceFile('generated.ts', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
      // @ts-expect-error parseDiagnostics is internal, and is the only way to see syntax errors here.
      expect(parsed.parseDiagnostics ?? []).toEqual([]);
    }
  });

  it('places the banner first', () => {
    expect(generateManifestSource(entries, { banner: ['// generated'] }).startsWith('// generated\n')).toBe(true);
  });
});
