import { generateRequirementModuleSource } from './requirementModuleSource';

describe('generateRequirementModuleSource', () => {
  it('imports exactly the resolved registrars and calls each one', () => {
    const source = generateRequirementModuleSource(
      plan([entry('@flighthq/swf', 'registerSwfShapeTags'), entry('@flighthq/swf', 'registerSwfTextTags')]),
    );
    expect(source).toContain("import { registerSwfShapeTags, registerSwfTextTags } from '@flighthq/swf';");
    expect(source).toContain('  registerSwfShapeTags(state);');
    expect(source).toContain('  registerSwfTextTags(state);');
  });

  it('emits byte-identical source for the same plan in a different observed order', () => {
    const a = entry('@flighthq/b', 'registerB');
    const b = entry('@flighthq/a', 'registerA');
    expect(generateRequirementModuleSource(plan([a, b]))).toBe(generateRequirementModuleSource(plan([b, a])));
  });

  it('groups registrars by module and sorts both modules and symbols', () => {
    const source = generateRequirementModuleSource(
      plan([entry('@flighthq/z', 'registerZ'), entry('@flighthq/a', 'registerB'), entry('@flighthq/a', 'registerA')]),
    );
    const imports = source.split('\n').filter((line) => line.startsWith('import '));
    expect(imports).toEqual([
      "import { registerA, registerB } from '@flighthq/a';",
      "import { registerZ } from '@flighthq/z';",
    ]);
  });

  it('collapses a registrar two requirements both resolved to', () => {
    const source = generateRequirementModuleSource(
      plan([entry('@flighthq/swf', 'registerSwfShapeTags'), entry('@flighthq/swf', 'registerSwfShapeTags')]),
    );
    expect(source.match(/registerSwfShapeTags\(state\);/gu)).toHaveLength(1);
  });

  it('emits a valid module with no imports when nothing resolved', () => {
    const source = generateRequirementModuleSource(plan([]));
    expect(source).not.toContain('import ');
    expect(source).toContain('export function registerScannedRequirements(state) {');
    expect(source).toContain('No requirement in the scanned content resolved to a registrar.');
  });

  it('names the backend so a generated module is attributable', () => {
    expect(generateRequirementModuleSource(plan([], 'webgl'))).toContain('Backend: webgl');
  });
});

function entry(registrarImport: string, registrarSymbol: string) {
  return {
    backend: 'canvas',
    facet: 'document.format' as const,
    implementationImport: registrarImport,
    implementationSymbol: 'implementation',
    kind: 'DefineShape',
    registrarImport,
    registrarSymbol,
  };
}

function plan(entries: ReturnType<typeof entry>[], backend = 'canvas') {
  return { backend, entries, unresolved: [] };
}
