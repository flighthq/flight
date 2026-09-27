import { describe, expect, it } from 'vitest';

import { createScene2DFromLottieDocument } from './lottieImport.ts';
import {
  animatedLottieTestScalar,
  animatedLottieTestVector,
  createLottieTestDocument,
  findLottieTestNodeByKind,
  findLottieTestNodeByName,
  lottieTestShapeLayer,
  lottieTestSquarePath,
} from './lottieTestFixtures.ts';

// ★ A FIXTURE BUILDER IS A SECOND IMPLEMENTATION OF THE FORMAT, so it needs its own tests. Eleven per-feature test
// files now assert against these builders; a builder that produced a document the importer rejects would make every
// one of them fail for a reason that has nothing to do with the feature under test.
describe('animatedLottieTestScalar', () => {
  it('builds an animated property with two keyframes over the fixture timeline', () => {
    const property = animatedLottieTestScalar(0, 10);
    expect(property.a).toBe(1);
    expect(property.k).toHaveLength(2);
    // A SCALAR keyframe carries a bare number, where a vector keyframe carries an array. Lottie writes both forms and
    // the importer reads both; asserting the bare form here is what keeps this fixture honest about which it builds.
    expect(property.k[0].s).toBe(0);
    expect(property.k[1].s).toBe(10);
  });
});

describe('animatedLottieTestVector', () => {
  it('builds an animated vector whose keyframes carry both components', () => {
    const property = animatedLottieTestVector([0, 0], [10, 20]);
    expect(property.a).toBe(1);
    expect(property.k[0].s).toEqual([0, 0]);
    expect(property.k[1].s).toEqual([10, 20]);
  });
});

describe('createLottieTestDocument', () => {
  // The importer rejects a document missing any of these, so the fixture must carry all of them or every test using
  // it would measure the reject path instead of the feature.
  it('carries the fields the importer requires of a valid document', () => {
    const document = createLottieTestDocument([lottieTestShapeLayer(1, 'shape')]);
    expect(document.fr).toBeGreaterThan(0);
    expect(document.op).toBeGreaterThan(document.ip);
    expect(document.w).toBeGreaterThan(0);
    expect(document.h).toBeGreaterThan(0);
    expect(document.layers).toHaveLength(1);
  });
});

describe('findLottieTestNodeByKind', () => {
  it('finds a node of the kind anywhere in the subtree, and null for an absent kind', () => {
    const document = createLottieTestDocument([lottieTestShapeLayer(1, 'shape')]);
    const root = importRoot(document);
    expect(findLottieTestNodeByKind(root, 'Shape')).not.toBeNull();
    expect(findLottieTestNodeByKind(root, 'NoSuchKind')).toBeNull();
  });
});

describe('findLottieTestNodeByName', () => {
  it('finds a named node and answers null for a name nothing carries', () => {
    const root = importRoot(createLottieTestDocument([lottieTestShapeLayer(1, 'shape')]));
    expect(findLottieTestNodeByName(root, 'shape')).not.toBeNull();
    expect(findLottieTestNodeByName(root, 'absent')).toBeNull();
  });
});

describe('lottieTestShapeLayer', () => {
  it('builds a shape layer carrying one rectangle and a fill', () => {
    const layer = lottieTestShapeLayer(3, 'named');
    expect(layer.ind).toBe(3);
    expect(layer.nm).toBe('named');
    expect(layer.shapes?.length).toBeGreaterThan(0);
  });
});

describe('lottieTestSquarePath', () => {
  it('builds a closed four-vertex path with zero tangents', () => {
    const path = lottieTestSquarePath(0, 0, 10);
    expect(path.c).toBe(true);
    expect(path.v).toHaveLength(4);
    expect(path.i).toHaveLength(4);
    expect(path.o).toHaveLength(4);
  });
});

function importRoot(document: ReturnType<typeof createLottieTestDocument>) {
  // Imported through the zero-config entry, because what these finders have to work on is the tree the importer
  // actually builds — not a hand-made one that might differ from it.
  return createScene2DFromLottieDocument(document).root;
}
