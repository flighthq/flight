import { parseObjMaterialLibrary } from './mtlParse';

describe('parseObjMaterialLibrary', () => {
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

  it('skips unrecognized directives without warning', () => {
    const mtl = 'newmtl M\nKd 1 1 1\nunknown_directive value\n';
    const warnings: string[] = [];
    const lib = parseObjMaterialLibrary(mtl, warnings);
    expect(lib.materials.size).toBe(1);
    expect(warnings).toHaveLength(0);
  });

  it('warns on malformed color values', () => {
    const mtl = 'newmtl M\nKd abc def ghi\n';
    const warnings: string[] = [];
    parseObjMaterialLibrary(mtl, warnings);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes('non-numeric'))).toBe(true);
  });

  it('warns on color with fewer than 3 components', () => {
    const mtl = 'newmtl M\nKa 1 2\n';
    const warnings: string[] = [];
    parseObjMaterialLibrary(mtl, warnings);
    expect(warnings.some((w) => w.includes('fewer than 3'))).toBe(true);
  });

  it('warns when a directive appears before any newmtl', () => {
    const mtl = 'Kd 1 0 0\n';
    const warnings: string[] = [];
    parseObjMaterialLibrary(mtl, warnings);
    expect(warnings.some((w) => w.includes('before any newmtl'))).toBe(true);
  });

  it('warns on newmtl with no name', () => {
    const mtl = 'newmtl\n';
    const warnings: string[] = [];
    parseObjMaterialLibrary(mtl, warnings);
    expect(warnings.some((w) => w.includes('no name'))).toBe(true);
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
