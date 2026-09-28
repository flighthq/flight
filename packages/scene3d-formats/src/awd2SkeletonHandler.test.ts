import {
  AWD2_BLOCK_SKELETON,
  AWD2_BLOCK_SKELETON_ANIMATION,
  AWD2_BLOCK_SKELETON_POSE,
  AWD2_BUILD_PHASE_SKELETON,
  AWD2_BUILD_PHASE_SKELETON_ANIMATION,
} from './awd2Schema.ts';
import {
  awd2SkeletonAnimationHandler,
  awd2SkeletonBlockHandler,
  awd2SkeletonPoseHandler,
} from './awd2SkeletonHandler.ts';

describe('awd2SkeletonAnimationHandler', () => {
  it('claims the skeleton animation block type', () => {
    expect(awd2SkeletonAnimationHandler.blockTypes).toEqual([AWD2_BLOCK_SKELETON_ANIMATION]);
  });

  it('has a parse function', () => {
    expect(typeof awd2SkeletonAnimationHandler.parse).toBe('function');
  });

  it('is deferred to the second pass', () => {
    expect(awd2SkeletonAnimationHandler.deferred).toBe(true);
  });

  it('declares the skeleton animation build phase', () => {
    expect(awd2SkeletonAnimationHandler.buildPhase).toBe(AWD2_BUILD_PHASE_SKELETON_ANIMATION);
    expect(typeof awd2SkeletonAnimationHandler.build).toBe('function');
  });
});

describe('awd2SkeletonBlockHandler', () => {
  it('claims the skeleton block type', () => {
    expect(awd2SkeletonBlockHandler.blockTypes).toEqual([AWD2_BLOCK_SKELETON]);
  });

  it('has a parse function', () => {
    expect(typeof awd2SkeletonBlockHandler.parse).toBe('function');
  });

  it('declares the skeleton build phase', () => {
    expect(awd2SkeletonBlockHandler.buildPhase).toBe(AWD2_BUILD_PHASE_SKELETON);
    expect(typeof awd2SkeletonBlockHandler.build).toBe('function');
  });
});

describe('awd2SkeletonPoseHandler', () => {
  it('claims the skeleton pose block type', () => {
    expect(awd2SkeletonPoseHandler.blockTypes).toEqual([AWD2_BLOCK_SKELETON_POSE]);
  });

  it('has a parse function', () => {
    expect(typeof awd2SkeletonPoseHandler.parse).toBe('function');
  });

  it('is deferred to the second pass', () => {
    expect(awd2SkeletonPoseHandler.deferred).toBe(true);
  });
});
