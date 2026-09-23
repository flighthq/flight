import {
  generateManifestModuleSource,
  MANIFEST_BACKEND_EXPORTS,
  MANIFEST_PARSER_BACKEND,
} from './manifestModuleSource';

describe('generateManifestModuleSource', () => {
  it('exports every backend fragment plus parserOptions, even when a backend needs nothing', () => {
    const source = generateManifestModuleSource([row('gl', 'scene.node-kind', 'Shape')], '.swf');
    for (const name of ['canvasOptions', 'domOptions', 'glOptions', 'wgpuOptions', 'parserOptions']) {
      expect(source).toContain(`export const ${name} =`);
    }
    expect(source).toContain('export const canvasOptions = {};');
  });

  it('spreads a scene kind into the matching options field as a Map', () => {
    const source = generateManifestModuleSource([row('gl', 'scene.node-kind', 'Shape')], '.swf');
    expect(source).toContain('export const glOptions = {');
    expect(source).toContain('nodeRenderers: new Map([');
    expect(source).toContain("['Shape', glShapeImpl],");
  });

  it('writes a precise named import for every referenced symbol', () => {
    const source = generateManifestModuleSource(
      [row('gl', 'scene.node-kind', 'Shape'), row('canvas', 'scene.material-kind', 'Standard')],
      '.swf',
    );
    const imports = source.split('\n').filter((line) => line.startsWith('import '));
    expect(imports).toEqual([
      "import { canvasStandardImpl } from '@acme/canvas';",
      "import { glShapeImpl } from '@acme/gl';",
    ]);
    expect(source).not.toContain('import *');
  });

  it('keeps each backend in its own fragment', () => {
    const source = generateManifestModuleSource(
      [row('gl', 'scene.node-kind', 'Shape'), row('wgpu', 'scene.node-kind', 'Shape')],
      '.swf',
    );
    expect(source).toContain("export const glOptions = {\n  nodeRenderers: new Map([\n    ['Shape', glShapeImpl],");
    expect(source).toContain("export const wgpuOptions = {\n  nodeRenderers: new Map([\n    ['Shape', wgpuShapeImpl],");
  });

  it('routes parser-backend rows to parserOptions under the format\u2019s own field', () => {
    expect(
      generateManifestModuleSource([row(MANIFEST_PARSER_BACKEND, 'document.format', 'DefineShape')], '.swf'),
    ).toContain('export const parserOptions = {\n  tags: [');
    expect(
      generateManifestModuleSource([row(MANIFEST_PARSER_BACKEND, 'document.format', 'Camera')], '.awd2'),
    ).toContain('export const parserOptions = {\n  blocks: [');
  });

  it('sends the same facet to a render fragment or to the parser by the row\u2019s backend', () => {
    const source = generateManifestModuleSource(
      [row(MANIFEST_PARSER_BACKEND, 'document.format', 'DefineShape'), row('canvas', 'scene.node-kind', 'DefineShape')],
      '.swf',
    );
    expect(source).toContain('export const parserOptions = {\n  tags: [\n    parserDefineShapeImpl,');
    expect(source).toContain(
      "export const canvasOptions = {\n  nodeRenderers: new Map([\n    ['DefineShape', canvasDefineShapeImpl],",
    );
  });

  it('preserves catalog order for handlers, because a handler list is ordered', () => {
    const source = generateManifestModuleSource(
      [
        row(MANIFEST_PARSER_BACKEND, 'document.format', 'Second'),
        row(MANIFEST_PARSER_BACKEND, 'document.format', 'First'),
      ],
      '.swf',
    );
    // Measured inside the fragment: the import lines above it are sorted, so a whole-file indexOf
    // would be testing the import order instead of the handler order.
    const fragment = source.slice(source.indexOf('export const parserOptions'));
    expect(fragment.indexOf('parserSecondImpl')).toBeLessThan(fragment.indexOf('parserFirstImpl'));
  });

  it('sorts map entries by kind so the same rows always emit the same bytes', () => {
    const a = row('gl', 'scene.node-kind', 'Alpha');
    const b = row('gl', 'scene.node-kind', 'Beta');
    expect(generateManifestModuleSource([a, b], '.swf')).toBe(generateManifestModuleSource([b, a], '.swf'));
  });

  it('reports an unmapped facet by omitting it rather than emitting a broken field', () => {
    const source = generateManifestModuleSource([row('gl', 'compression.kind', 'Deflate')], '.swf');
    expect(source).toContain('export const glOptions = {};');
    expect(source).not.toContain('glDeflateImpl');
  });

  it('emits a valid module with no imports when nothing resolved', () => {
    const source = generateManifestModuleSource([], '.swf');
    expect(source).not.toContain('import ');
    expect(source).toContain('export const parserOptions = {};');
  });
});

describe('MANIFEST_BACKEND_EXPORTS', () => {
  it('names one flat export per backend', () => {
    expect(MANIFEST_BACKEND_EXPORTS).toEqual({
      canvas: 'canvasOptions',
      dom: 'domOptions',
      gl: 'glOptions',
      wgpu: 'wgpuOptions',
    });
  });
});

function row(backend: string, facet: string, kind: string) {
  const symbol = `${backend}${kind}Impl`;
  return {
    entry: {
      backend,
      facet: facet as never,
      implementationImport: `@acme/${backend}`,
      implementationSymbol: symbol,
      kind,
      registrarImport: `@acme/${backend}`,
      registrarSymbol: `register${kind}`,
    },
    kind,
  };
}
