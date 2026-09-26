import { collectMd5AnimFeatures } from './md5AnimFeatures.ts';

describe('collectMd5AnimFeatures', () => {
  it('returns an empty set for empty input', () => {
    expect([...collectMd5AnimFeatures('')]).toEqual([]);
  });

  it('returns an empty set for comments-only input', () => {
    expect([...collectMd5AnimFeatures('// MD5 anim file\n// comment\n')]).toEqual([]);
  });

  it('detects Hierarchy from hierarchy section', () => {
    const source = 'hierarchy {\n"root" -1 63 0\n}\n';
    const features = collectMd5AnimFeatures(source);
    expect(features.has('Hierarchy')).toBe(true);
    expect(features.has('Animation')).toBe(false);
  });

  it('detects Animation from frame section', () => {
    const source = 'frame 0 {\n1.0 2.0 3.0\n}\n';
    const features = collectMd5AnimFeatures(source);
    expect(features.has('Animation')).toBe(true);
    expect(features.has('Hierarchy')).toBe(false);
  });

  it('reports both features for a full anim file', () => {
    const source = [
      'MD5Version 10',
      'numFrames 2',
      'numJoints 1',
      'frameRate 24',
      'numAnimatedComponents 6',
      'hierarchy {',
      '"root" -1 63 0',
      '}',
      'baseframe {',
      '( 0 0 0 ) ( 0 0 0 )',
      '}',
      'frame 0 {',
      '0 0 0 0 0 0',
      '}',
      'frame 1 {',
      '1 0 0 0 0 0',
      '}',
    ].join('\n');
    expect([...collectMd5AnimFeatures(source)].sort()).toEqual(['Animation', 'Hierarchy']);
  });

  it('does not claim Mesh, Skeleton, or Material features', () => {
    const source = 'hierarchy {\n"root" -1 63 0\n}\nframe 0 {\n0 0 0\n}\n';
    const features = collectMd5AnimFeatures(source);
    expect(features.has('Mesh')).toBe(false);
    expect(features.has('Skeleton')).toBe(false);
    expect(features.has('Material')).toBe(false);
  });

  it('ignores comments interspersed with sections', () => {
    const source = '// comment\nhierarchy {\n// data\n}\n// more\nframe 0 {\n// values\n}\n';
    const features = collectMd5AnimFeatures(source);
    expect(features.has('Hierarchy')).toBe(true);
    expect(features.has('Animation')).toBe(true);
  });

  it('stops early once both features are found', () => {
    const source = 'hierarchy {\n}\nframe 0 {\n}\nframe 1 {\n}\nframe 2 {\n}\n';
    const features = collectMd5AnimFeatures(source);
    expect([...features].sort()).toEqual(['Animation', 'Hierarchy']);
  });

  it('handles a hierarchy-only file with no frame sections', () => {
    const source = 'MD5Version 10\nhierarchy {\n"root" -1 0 0\n}\nbaseframe {\n( 0 0 0 ) ( 0 0 0 )\n}\n';
    const features = collectMd5AnimFeatures(source);
    expect(features.has('Hierarchy')).toBe(true);
    expect(features.has('Animation')).toBe(false);
  });
});
