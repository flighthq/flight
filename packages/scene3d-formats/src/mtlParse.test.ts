import type { ImportDiagnostic } from '@flighthq/types/contract';

import { parseObjMaterialLibrary } from './mtlParse';

// Asserts EXACTLY ONE crumb of `kind` was recorded (guards the count) and returns it so a test can lock
// the full contract — severity, true origin, and detail — for that emitted diagnostic.
function expectOneCrumb(diagnostics: readonly ImportDiagnostic[], kind: string): ImportDiagnostic {
  const matches = diagnostics.filter((d) => d.kind === kind);
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe('parseObjMaterialLibrary', () => {
  // A clean parse is two claims: the values are right AND THE PARSER IS NOT COMPLAINING. Every other test
  // here checks the first. This checks the second — the one that catches a walk that desynchronised and
  // still left the asserted fields looking plausible. Asserted as an EMPTY list rather than a filter over
  // truncation-shaped kind names: a pattern built from expected vocabulary silently exempts every kind
  // whose name nobody guessed, and this importer has kinds like that.
  it('raises no diagnostic at all for a well-formed file', () => {
    const diagnostics: ImportDiagnostic[] = [];

    parseObjMaterialLibrary(['newmtl Body', 'Kd 1 0 0'].join('\n'), diagnostics);

    const complaints = diagnostics.map((diagnostic) => diagnostic.kind);
    expect(complaints, `a good mtl file made the parser complain: ${complaints.join(', ')}`).toEqual([]);
  });

  it('parses a single material with all property types', () => {
    const mtl = [
      'newmtl TestMat',
      'Ka 0.1 0.2 0.3',
      'Kd 0.4 0.5 0.6',
      'Ks 0.7 0.8 0.9',
      'Ns 100.0',
      'd 0.75',
      'illum 2',
      'map_Kd diffuse.png',
      'map_Ka ambient.png',
      'map_Ks specular.png',
      'map_Bump normal.png',
    ].join('\n');

    const lib = parseObjMaterialLibrary(mtl);
    expect(lib.materials.size).toBe(1);

    const mat = lib.materials.get('TestMat')!;
    expect(mat.name).toBe('TestMat');
    expect(mat.ambient).toEqual([0.1, 0.2, 0.3]);
    expect(mat.diffuse).toEqual([0.4, 0.5, 0.6]);
    expect(mat.specular).toEqual([0.7, 0.8, 0.9]);
    expect(mat.specularExponent).toBe(100);
    expect(mat.dissolve).toBe(0.75);
    expect(mat.illumination).toBe(2);
    expect(mat.mapDiffuse).toBe('diffuse.png');
    expect(mat.mapAmbient).toBe('ambient.png');
    expect(mat.mapSpecular).toBe('specular.png');
    expect(mat.mapBump).toBe('normal.png');
  });

  it('parses multiple materials', () => {
    const mtl = ['newmtl MatA', 'Kd 1 0 0', '', 'newmtl MatB', 'Kd 0 1 0'].join('\n');

    const lib = parseObjMaterialLibrary(mtl);
    expect(lib.materials.size).toBe(2);
    expect(lib.materials.get('MatA')!.diffuse).toEqual([1, 0, 0]);
    expect(lib.materials.get('MatB')!.diffuse).toEqual([0, 1, 0]);
  });

  it('treats Tr as inverse dissolve', () => {
    const mtl = 'newmtl M\nTr 0.3\n';
    const lib = parseObjMaterialLibrary(mtl);
    expect(lib.materials.get('M')!.dissolve).toBeCloseTo(0.7);
  });

  it('accepts bump as an alias for map_Bump', () => {
    const mtl = 'newmtl M\nbump normal_map.tga\n';
    const lib = parseObjMaterialLibrary(mtl);
    expect(lib.materials.get('M')!.mapBump).toBe('normal_map.tga');
  });

  it('returns an empty library for empty input', () => {
    const lib = parseObjMaterialLibrary('');
    expect(lib.materials.size).toBe(0);
  });

  it('returns an empty library for comment-only input', () => {
    const lib = parseObjMaterialLibrary('# This is a comment\n# Another comment\n');
    expect(lib.materials.size).toBe(0);
  });

  it('skips unrecognized directives without recording a diagnostic', () => {
    const mtl = 'newmtl M\nKd 1 1 1\nunknown_directive value\n';
    const diagnostics: ImportDiagnostic[] = [];
    const lib = parseObjMaterialLibrary(mtl, diagnostics);
    expect(lib.materials.size).toBe(1);
    expect(diagnostics).toHaveLength(0);
  });

  it.each([
    { directive: 'Kd', mtl: 'newmtl M\nKd abc def ghi\n', reason: 'non-numeric' },
    { directive: 'Ka', mtl: 'newmtl M\nKa 1 2\n', reason: 'too-few-components' },
  ])(
    'records color-malformed (Recover, parseObjMaterialLibrary) — $directive $reason',
    ({ directive, mtl, reason }) => {
      const diagnostics: ImportDiagnostic[] = [];
      parseObjMaterialLibrary(mtl, diagnostics);
      expect(diagnostics).toHaveLength(1);
      const crumb = expectOneCrumb(diagnostics, 'mtl.color-malformed');
      expect(crumb.severity).toBe('Recover');
      expect(crumb.origin).toBe('parseObjMaterialLibrary');
      expect(crumb.detail?.firstDirective).toBe(directive);
      expect(crumb.detail?.firstLine).toBe(2);
      expect(crumb.detail?.reason).toBe(reason);
      expect(crumb.detail?.count).toBe(1);
    },
  );

  it.each([{ directive: 'Ns' }, { directive: 'd' }, { directive: 'Tr' }, { directive: 'illum' }])(
    'records invalid-value (Recover, parseObjMaterialLibrary) on a non-numeric $directive value',
    ({ directive }) => {
      const diagnostics: ImportDiagnostic[] = [];
      parseObjMaterialLibrary(`newmtl M\n${directive} abc\n`, diagnostics);
      expect(diagnostics).toHaveLength(1);
      const crumb = expectOneCrumb(diagnostics, 'mtl.invalid-value');
      expect(crumb.severity).toBe('Recover');
      expect(crumb.origin).toBe('parseObjMaterialLibrary');
      expect(crumb.detail?.directive).toBe(directive);
      expect(crumb.detail?.firstLine).toBe(2);
      expect(crumb.detail?.count).toBe(1);
    },
  );

  it('records directive-before-material (Drop, parseObjMaterialLibrary) when a directive precedes any newmtl', () => {
    const mtl = 'Kd 1 0 0\n';
    const diagnostics: ImportDiagnostic[] = [];
    parseObjMaterialLibrary(mtl, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'mtl.directive-before-material');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseObjMaterialLibrary');
    expect(crumb.detail?.firstDirective).toBe('Kd');
    expect(crumb.detail?.firstLine).toBe(1);
    expect(crumb.detail?.count).toBe(1);
  });

  it('records newmtl-no-name (Drop, parseObjMaterialLibrary) on a newmtl with no name', () => {
    const mtl = 'newmtl\n';
    const diagnostics: ImportDiagnostic[] = [];
    parseObjMaterialLibrary(mtl, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'mtl.newmtl-no-name');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseObjMaterialLibrary');
    expect(crumb.detail?.firstLine).toBe(1);
    expect(crumb.detail?.count).toBe(1);
  });

  it('aggregates repeated MTL failures into ONE crumb per (kind, discriminator) with the total count', () => {
    // Two invalid Ns lines aggregate to a single invalid-value:Ns crumb (count 2, first line kept); a
    // separate invalid Tr line is a distinct directive, so it is its own crumb — never emitted per line.
    const diagnostics: ImportDiagnostic[] = [];
    parseObjMaterialLibrary('newmtl M\nNs a\nNs b\nTr c\n', diagnostics);
    const nsCrumbs = diagnostics.filter((d) => d.kind === 'mtl.invalid-value' && d.detail?.directive === 'Ns');
    expect(nsCrumbs).toHaveLength(1);
    expect(nsCrumbs[0].detail?.count).toBe(2);
    expect(nsCrumbs[0].detail?.firstLine).toBe(2);
    const trCrumbs = diagnostics.filter((d) => d.kind === 'mtl.invalid-value' && d.detail?.directive === 'Tr');
    expect(trCrumbs).toHaveLength(1);
    expect(trCrumbs[0].detail?.count).toBe(1);
  });

  // BARE recognized directives (no value) after a material are implicit malformed no-ops the old code
  // skipped silently. Probe every one: the announced value/filename still records a drop.
  it.each([{ directive: 'Ka' }, { directive: 'Kd' }, { directive: 'Ks' }])(
    'records color-malformed (Recover, parseObjMaterialLibrary) for a bare $directive after a material',
    ({ directive }) => {
      const diagnostics: ImportDiagnostic[] = [];
      parseObjMaterialLibrary(`newmtl M\n${directive}\n`, diagnostics);
      expect(diagnostics).toHaveLength(1);
      const crumb = expectOneCrumb(diagnostics, 'mtl.color-malformed');
      expect(crumb.severity).toBe('Recover');
      expect(crumb.origin).toBe('parseObjMaterialLibrary');
      expect(crumb.detail?.firstDirective).toBe(directive);
      expect(crumb.detail?.reason).toBe('too-few-components');
      expect(crumb.detail?.firstLine).toBe(2);
      expect(crumb.detail?.count).toBe(1);
    },
  );

  it.each([{ directive: 'Ns' }, { directive: 'd' }, { directive: 'Tr' }, { directive: 'illum' }])(
    'records invalid-value (Recover, parseObjMaterialLibrary) for a bare $directive after a material',
    ({ directive }) => {
      const diagnostics: ImportDiagnostic[] = [];
      parseObjMaterialLibrary(`newmtl M\n${directive}\n`, diagnostics);
      expect(diagnostics).toHaveLength(1);
      const crumb = expectOneCrumb(diagnostics, 'mtl.invalid-value');
      expect(crumb.severity).toBe('Recover');
      expect(crumb.origin).toBe('parseObjMaterialLibrary');
      expect(crumb.detail?.directive).toBe(directive);
      expect(crumb.detail?.firstLine).toBe(2);
      expect(crumb.detail?.count).toBe(1);
    },
  );

  it.each([
    { directive: 'map_Kd' },
    { directive: 'map_Ka' },
    { directive: 'map_Ks' },
    { directive: 'map_Bump' },
    { directive: 'bump' },
  ])(
    'records map-no-filename (Drop, parseObjMaterialLibrary) for a bare $directive after a material',
    ({ directive }) => {
      const diagnostics: ImportDiagnostic[] = [];
      parseObjMaterialLibrary(`newmtl M\n${directive}\n`, diagnostics);
      expect(diagnostics).toHaveLength(1);
      const crumb = expectOneCrumb(diagnostics, 'mtl.map-no-filename');
      expect(crumb.severity).toBe('Drop');
      expect(crumb.origin).toBe('parseObjMaterialLibrary');
      expect(crumb.detail?.directive).toBe(directive);
      expect(crumb.detail?.firstLine).toBe(2);
      expect(crumb.detail?.count).toBe(1);
    },
  );

  it('records directive-before-material (Drop) for a BARE directive before any newmtl', () => {
    const diagnostics: ImportDiagnostic[] = [];
    parseObjMaterialLibrary('Kd\n', diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'mtl.directive-before-material');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseObjMaterialLibrary');
    expect(crumb.detail?.firstDirective).toBe('Kd');
    expect(crumb.detail?.count).toBe(1);
  });

  it('records no diagnostics for a well-formed MTL even with a collector engaged', () => {
    const diagnostics: ImportDiagnostic[] = [];
    parseObjMaterialLibrary('newmtl M\nKd 1 0 0\nNs 32\nmap_Kd tex.png\n', diagnostics);
    expect(diagnostics).toHaveLength(0);
  });

  it('provides defaults for unset properties', () => {
    const mtl = 'newmtl Default\n';
    const lib = parseObjMaterialLibrary(mtl);
    const mat = lib.materials.get('Default')!;
    expect(mat.ambient).toEqual([0, 0, 0]);
    expect(mat.diffuse).toEqual([0.8, 0.8, 0.8]);
    expect(mat.specular).toEqual([0, 0, 0]);
    expect(mat.specularExponent).toBe(0);
    expect(mat.dissolve).toBe(1);
    expect(mat.illumination).toBe(2);
    expect(mat.mapDiffuse).toBeNull();
    expect(mat.mapAmbient).toBeNull();
    expect(mat.mapSpecular).toBeNull();
    expect(mat.mapBump).toBeNull();
  });
});

describe('parseObjMaterialLibrary PBR extension directives', () => {
  it('leaves every PBR extension field null when the file states none', () => {
    // This is the load-bearing case: null means the file DID NOT SAY, which is what lets a consumer pick
    // Blinn-Phong for a classic material instead of inventing a roughness for it.
    const material = parseObjMaterialLibrary('newmtl M\nKd 1 1 1\nNs 32\n').materials.get('M')!;

    expect(material.roughness).toBeNull();
    expect(material.metallic).toBeNull();
    expect(material.sheen).toBeNull();
    expect(material.clearcoat).toBeNull();
    expect(material.clearcoatRoughness).toBeNull();
    expect(material.anisotropy).toBeNull();
    expect(material.anisotropyRotation).toBeNull();
    expect(material.emissive).toBeNull();
    expect(material.mapRoughness).toBeNull();
    expect(material.mapMetallic).toBeNull();
    expect(material.mapEmissive).toBeNull();
    expect(material.mapNormal).toBeNull();
  });

  it('reads the scalar PBR extension directives', () => {
    const material = parseObjMaterialLibrary(
      'newmtl M\nPr 0.25\nPm 0.75\nPs 0.4\nPc 0.2\nPcr 0.15\naniso 0.3\nanisor 0.6\n',
    ).materials.get('M')!;

    expect(material.roughness).toBeCloseTo(0.25, 6);
    expect(material.metallic).toBeCloseTo(0.75, 6);
    expect(material.sheen).toBeCloseTo(0.4, 6);
    expect(material.clearcoat).toBeCloseTo(0.2, 6);
    expect(material.clearcoatRoughness).toBeCloseTo(0.15, 6);
    expect(material.anisotropy).toBeCloseTo(0.3, 6);
    expect(material.anisotropyRotation).toBeCloseTo(0.6, 6);
  });

  it('distinguishes a stated zero from an absent directive', () => {
    // Pr 0 is a mirror-smooth surface the author asked for; it must not read as "unstated".
    const material = parseObjMaterialLibrary('newmtl M\nPr 0\n').materials.get('M')!;

    expect(material.roughness).toBe(0);
    expect(material.metallic).toBeNull();
  });

  it('reads Ke as a color and the PBR map filenames', () => {
    const material = parseObjMaterialLibrary(
      'newmtl M\nKe 1 0.5 0\nmap_Ke glow.png\nmap_Pr rough.png\nmap_Pm metal.png\nnorm normal.png\n',
    ).materials.get('M')!;

    expect(material.emissive).toEqual([1, 0.5, 0]);
    expect(material.mapEmissive).toBe('glow.png');
    expect(material.mapRoughness).toBe('rough.png');
    expect(material.mapMetallic).toBe('metal.png');
    expect(material.mapNormal).toBe('normal.png');
  });

  it('records a diagnostic for a malformed PBR scalar and keeps the field unstated', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const material = parseObjMaterialLibrary('newmtl M\nPr notanumber\n', diagnostics).materials.get('M')!;

    expect(material.roughness).toBeNull();
    expect(diagnostics.length).toBeGreaterThan(0);
  });
});
