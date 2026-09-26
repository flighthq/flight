import { collectObjFeatures, OBJ_FEATURE_DIRECTIVES } from './objFeatures.ts';

describe('collectObjFeatures', () => {
  it('reports only the features a MINIMAL document contains', () => {
    expect([...collectObjFeatures('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3')]).toEqual(['Face']);
  });

  it('reports nothing for a source with only vertex positions and no topology', () => {
    expect([...collectObjFeatures('v 0 0 0\nv 1 0 0\nv 0 1 0')]).toEqual([]);
  });

  it('reports nothing for empty input', () => {
    expect([...collectObjFeatures('')]).toEqual([]);
  });

  it('reports nothing for a source of only comments and whitespace', () => {
    expect([...collectObjFeatures('# OBJ file\n# exported by tool\n\n  \n')]).toEqual([]);
  });

  it('reports every feature a FULL document contains', () => {
    const full = [
      'v 0 0 0',
      'v 1 0 0',
      'v 0 1 0',
      'v 0 0 1',
      'mtllib material.mtl',
      'usemtl stone',
      'f 1 2 3',
      'l 1 2 3',
      'p 4',
    ].join('\n');
    expect([...collectObjFeatures(full)].sort()).toEqual(['Face', 'Line', 'Material', 'Point']);
  });

  it('detects Material from usemtl alone', () => {
    expect([...collectObjFeatures('v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl stone\nf 1 2 3')].sort()).toEqual([
      'Face',
      'Material',
    ]);
  });

  it('detects Material from mtllib alone', () => {
    expect([...collectObjFeatures('mtllib scene.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3')].sort()).toEqual([
      'Face',
      'Material',
    ]);
  });

  it('detects Line elements', () => {
    expect([...collectObjFeatures('v 0 0 0\nv 1 0 0\nl 1 2')]).toEqual(['Line']);
  });

  it('detects Point elements', () => {
    expect([...collectObjFeatures('v 0 0 0\np 1')]).toEqual(['Point']);
  });

  it('ignores comments interspersed with directives', () => {
    const source = '# comment\nv 0 0 0\n# another\nv 1 0 0\nv 0 1 0\n# face:\nf 1 2 3';
    expect([...collectObjFeatures(source)]).toEqual(['Face']);
  });

  it('handles directives with extra whitespace', () => {
    expect([...collectObjFeatures('  f 1 2 3')]).toEqual(['Face']);
  });

  it('does not treat a bare directive word inside a comment as a feature', () => {
    expect([...collectObjFeatures('# f 1 2 3\n# usemtl stone')]).toEqual([]);
  });

  it('handles a malformed face (too few verts) as a face feature since the directive is present', () => {
    expect([...collectObjFeatures('v 0 0 0\nf 1')]).toEqual(['Face']);
  });

  it('detects a bare directive without arguments as the feature', () => {
    expect([...collectObjFeatures('f')]).toEqual(['Face']);
  });
});

describe('OBJ_FEATURE_DIRECTIVES', () => {
  it('covers the four features the importer reads', () => {
    expect([...OBJ_FEATURE_DIRECTIVES.keys()].sort()).toEqual(['Face', 'Line', 'Material', 'Point']);
    for (const directives of OBJ_FEATURE_DIRECTIVES.values()) expect(directives.length).toBeGreaterThan(0);
  });
});
