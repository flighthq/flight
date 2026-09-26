import { collectMd5MeshFeatures } from './md5MeshFeatures.ts';

describe('collectMd5MeshFeatures', () => {
  it('returns an empty set for empty input', () => {
    expect([...collectMd5MeshFeatures('')]).toEqual([]);
  });

  it('returns an empty set for comments-only input', () => {
    expect([...collectMd5MeshFeatures('// MD5 mesh file\n// exported\n')]).toEqual([]);
  });

  it('detects Skeleton from joints section', () => {
    const source = 'MD5Version 10\njoints {\n"root" -1 ( 0 0 0 ) ( 0 0 0 )\n}\n';
    const features = collectMd5MeshFeatures(source);
    expect(features.has('Skeleton')).toBe(true);
  });

  it('detects Mesh from mesh section', () => {
    const source = 'MD5Version 10\nmesh {\nshader ""\nnumverts 0\nnumtris 0\nnumweights 0\n}\n';
    const features = collectMd5MeshFeatures(source);
    expect(features.has('Mesh')).toBe(true);
  });

  it('detects Material from a mesh section with a non-empty shader', () => {
    const source = 'mesh {\nshader "models/player/body"\nnumverts 0\nnumtris 0\nnumweights 0\n}\n';
    const features = collectMd5MeshFeatures(source);
    expect(features.has('Material')).toBe(true);
  });

  it('does not detect Material when shader is empty quotes', () => {
    const source = 'mesh {\nshader ""\nnumverts 0\nnumtris 0\nnumweights 0\n}\n';
    const features = collectMd5MeshFeatures(source);
    expect(features.has('Material')).toBe(false);
  });

  it('does not detect Material when shader has no quotes', () => {
    const source = 'mesh {\nshader\nnumverts 0\nnumtris 0\nnumweights 0\n}\n';
    const features = collectMd5MeshFeatures(source);
    expect(features.has('Material')).toBe(false);
  });

  it('reports all features for a full MD5 mesh file', () => {
    const source = [
      'MD5Version 10',
      'joints {',
      '"root" -1 ( 0 0 0 ) ( 0 0 0 )',
      '}',
      'mesh {',
      'shader "models/body"',
      'numverts 1',
      'vert 0 ( 0.5 0.5 ) 0 1',
      'numtris 1',
      'tri 0 0 0 0',
      'numweights 1',
      'weight 0 0 1.0 ( 0 0 0 )',
      '}',
    ].join('\n');
    expect([...collectMd5MeshFeatures(source)].sort()).toEqual(['Material', 'Mesh', 'Skeleton']);
  });

  it('detects Material from only the first mesh with a shader in multiple meshes', () => {
    const source = ['mesh {', 'shader ""', '}', 'mesh {', 'shader "models/arm"', '}'].join('\n');
    const features = collectMd5MeshFeatures(source);
    expect(features.has('Material')).toBe(true);
    expect(features.has('Mesh')).toBe(true);
  });

  it('ignores comments interspersed with sections', () => {
    const source = '// comment\njoints {\n// joint data\n}\n// more\nmesh {\n// mesh data\n}\n';
    const features = collectMd5MeshFeatures(source);
    expect(features.has('Skeleton')).toBe(true);
    expect(features.has('Mesh')).toBe(true);
  });

  it('handles unclosed mesh section gracefully', () => {
    const source = 'mesh {\nshader "test"\n';
    const features = collectMd5MeshFeatures(source);
    expect(features.has('Mesh')).toBe(true);
    expect(features.has('Material')).toBe(true);
  });
});
