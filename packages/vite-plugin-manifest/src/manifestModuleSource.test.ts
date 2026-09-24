import {
  generateManifestModuleSource,
  MANIFEST_BACKEND_EXPORTS,
  MANIFEST_PARSER_BACKEND,
} from './manifestModuleSource';

describe('generateManifestModuleSource', () => {
  it('exports every backend fragment plus parserOptions, even when a backend needs nothing', () => {
    const source = generateManifestModuleSource([row('gl', 'scene.node-kind', 'Shape')], '.swf').source;
    for (const name of ['canvasOptions', 'domOptions', 'glOptions', 'wgpuOptions', 'parserOptions']) {
      expect(source).toContain(`export const ${name} =`);
    }
    expect(source).toContain('export const canvasOptions = {};');
  });

  it('spreads a scene kind into the matching options field as a Map', () => {
    const source = generateManifestModuleSource([row('gl', 'scene.node-kind', 'Shape')], '.swf').source;
    expect(source).toContain('export const glOptions = {');
    expect(source).toContain('nodeRenderers: new Map([');
    expect(source).toContain("['Shape', glShapeImpl],");
  });

  it('writes a precise named import for every referenced symbol', () => {
    const source = generateManifestModuleSource(
      [row('gl', 'scene.node-kind', 'Shape'), row('wgpu', 'scene.material-kind', 'Standard')],
      '.swf',
    ).source;
    const imports = source.split('\n').filter((line) => line.startsWith('import '));
    expect(imports).toEqual([
      "import { glShapeImpl } from '@acme/gl';",
      "import { wgpuStandardImpl } from '@acme/wgpu';",
    ]);
    expect(source).not.toContain('import *');
  });

  // CanvasRenderOptions and DomRenderOptions declare NO kind-keyed fields on base: canvas takes its
  // registries as a separate constructor parameter and DOM accepts none. So a row aimed at either is
  // reported rather than emitted into a field that does not exist. Pending an API ruling, this pins
  // what the plugin does today instead of pretending the fragment would spread.
  it.each(['canvas', 'dom', 'gl', 'wgpu'])('emits a nodeRenderers fragment for %s', (backend) => {
    const result = generateManifestModuleSource([row(backend, 'scene.node-kind', 'Shape')], '.swf');
    expect(result.source).toContain(`export const ${backend}Options = {\n  nodeRenderers: new Map([`);
    expect(result.problems).toEqual([]);
  });

  // The backend sets are NOT interchangeable, and these are the real differences on base.
  it('reports materialRenderers aimed at dom, which DomRenderOptions does not declare', () => {
    const result = generateManifestModuleSource([row('dom', 'scene.material-kind', 'Standard')], '.swf');
    expect(result.source).toContain('export const domOptions = {};');
    expect(result.problems).toEqual([
      'backend dom has no materialRenderers field: dropped scene.material-kind Standard',
    ]);
  });

  it('reports blendRealizations aimed at canvas, which CanvasRenderStateOptions does not declare', () => {
    const result = generateManifestModuleSource([row('canvas', 'scene.blend-mode', 'Multiply')], '.swf');
    expect(result.problems).toEqual([
      'backend canvas has no blendRealizations field: dropped scene.blend-mode Multiply',
    ]);
  });

  it('keeps each backend in its own fragment', () => {
    const source = generateManifestModuleSource(
      [row('gl', 'scene.node-kind', 'Shape'), row('wgpu', 'scene.node-kind', 'Shape')],
      '.swf',
    ).source;
    expect(source).toContain("export const glOptions = {\n  nodeRenderers: new Map([\n    ['Shape', glShapeImpl],");
    expect(source).toContain("export const wgpuOptions = {\n  nodeRenderers: new Map([\n    ['Shape', wgpuShapeImpl],");
  });

  it('routes parser-backend rows to parserOptions under the format\u2019s own field', () => {
    expect(
      generateManifestModuleSource([row(MANIFEST_PARSER_BACKEND, 'document.format', 'DefineShape')], '.swf').source,
    ).toContain('export const parserOptions = {\n  tags: [');
    expect(
      generateManifestModuleSource([row(MANIFEST_PARSER_BACKEND, 'document.format', 'Camera')], '.awd2').source,
    ).toContain('export const parserOptions = {\n  blocks: [');
  });

  it('sends the same facet to a render fragment or to the parser by the row\u2019s backend', () => {
    const source = generateManifestModuleSource(
      [row(MANIFEST_PARSER_BACKEND, 'document.format', 'DefineShape'), row('gl', 'document.format', 'DefineShape')],
      '.swf',
    ).source;
    expect(source).toContain('export const parserOptions = {\n  tags: [\n    parserDefineShapeImpl,');
    expect(source).toContain(
      "export const glOptions = {\n  nodeRenderers: new Map([\n    ['DefineShape', glDefineShapeImpl],",
    );
  });

  it('preserves catalog order for handlers, because a handler list is ordered', () => {
    const source = generateManifestModuleSource(
      [
        row(MANIFEST_PARSER_BACKEND, 'document.format', 'Second'),
        row(MANIFEST_PARSER_BACKEND, 'document.format', 'First'),
      ],
      '.swf',
    ).source;
    // Measured inside the fragment: the import lines above it are sorted, so a whole-file indexOf
    // would be testing the import order instead of the handler order.
    const fragment = source.slice(source.indexOf('export const parserOptions'));
    expect(fragment.indexOf('parserSecondImpl')).toBeLessThan(fragment.indexOf('parserFirstImpl'));
  });

  it('sorts map entries by kind so the same rows always emit the same bytes', () => {
    const a = row('gl', 'scene.node-kind', 'Alpha');
    const b = row('gl', 'scene.node-kind', 'Beta');
    expect(generateManifestModuleSource([a, b], '.swf').source).toBe(
      generateManifestModuleSource([b, a], '.swf').source,
    );
  });

  it('REPORTS an unmapped facet rather than skipping it silently', () => {
    const result = generateManifestModuleSource([row('gl', 'compression.kind', 'Deflate')], '.swf');
    expect(result.source).toContain('export const glOptions = {};');
    expect(result.source).not.toContain('glDeflateImpl');
    expect(result.problems).toEqual([
      'facet compression.kind has no render-state options field: dropped Deflate for gl',
    ]);
  });

  it.each(['compression.kind', 'physics2d.joint-kind', 'scene.resource-mime-type'])(
    'reports %s, the facets with no render-state field',
    (facet) => {
      const result = generateManifestModuleSource([row('gl', facet, 'Thing')], '.swf');
      expect(result.problems).toHaveLength(1);
      expect(result.problems[0]).toContain(facet);
    },
  );

  it('does not leak a GL-only field into wgpu, and says so', () => {
    const result = generateManifestModuleSource(
      [row('gl', 'scene.blend-mode', 'Multiply'), row('wgpu', 'scene.blend-mode', 'Multiply')],
      '.swf',
    );
    expect(result.source).toContain('export const glOptions = {\n  blendRealizations: new Map([');
    expect(result.source).toContain('export const wgpuOptions = {};');
    expect(result.problems).toEqual(['backend wgpu has no blendRealizations field: dropped scene.blend-mode Multiply']);
    expect(result.source).not.toContain('wgpuMultiplyImpl');
  });

  it('reports a row naming a backend it does not know', () => {
    const result = generateManifestModuleSource([row('metal', 'scene.node-kind', 'Shape')], '.swf');
    expect(result.problems).toEqual(['unknown backend metal: dropped scene.node-kind Shape']);
  });

  it('emits a valid module with no imports when nothing resolved', () => {
    const source = generateManifestModuleSource([], '.swf').source;
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
