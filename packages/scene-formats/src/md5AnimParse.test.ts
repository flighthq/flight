import { sampleAnimationTrack } from '@flighthq/animation';
import { createSceneNode } from '@flighthq/scene';
import type { AnimationClip, SceneAnimationTarget, SceneNode } from '@flighthq/types';
import { SceneAnimationPathRotation, SceneAnimationPathTranslation } from '@flighthq/types';

import { parseMd5Anim } from './md5AnimParse';

// Minimal valid MD5 anim with one joint, one frame, no animated components (all from baseframe).
const SINGLE_JOINT_STATIC = [
  'MD5Version 10',
  'commandline ""',
  '',
  'numFrames 1',
  'numJoints 1',
  'frameRate 24',
  'numAnimatedComponents 0',
  '',
  'hierarchy {',
  '  "root" -1 0 0',
  '}',
  '',
  'bounds {',
  '  ( -1 -1 -1 ) ( 1 1 1 )',
  '}',
  '',
  'baseframe {',
  '  ( 5 10 15 ) ( 0 0 0 )',
  '}',
  '',
  'frame 0 {',
  '}',
].join('\n');

// Two joints, two frames, with animated tx/ty/tz on the first joint (flags=7, all position bits).
const TWO_JOINT_TWO_FRAME = [
  'MD5Version 10',
  'commandline ""',
  '',
  'numFrames 2',
  'numJoints 2',
  'frameRate 30',
  'numAnimatedComponents 3',
  '',
  'hierarchy {',
  '  "root" -1 7 0',
  '  "child" 0 0 0',
  '}',
  '',
  'bounds {',
  '  ( -1 -1 -1 ) ( 1 1 1 )',
  '  ( -1 -1 -1 ) ( 1 1 1 )',
  '}',
  '',
  'baseframe {',
  '  ( 0 0 0 ) ( 0 0 0 )',
  '  ( 1 2 3 ) ( 0 0 0 )',
  '}',
  '',
  'frame 0 {',
  '  0 0 0',
  '}',
  '',
  'frame 1 {',
  '  10 20 30',
  '}',
].join('\n');

// One joint with animated rotation (flags=56 = qx+qy+qz bits set).
const ANIMATED_ROTATION = [
  'MD5Version 10',
  'commandline ""',
  '',
  'numFrames 2',
  'numJoints 1',
  'frameRate 10',
  'numAnimatedComponents 3',
  '',
  'hierarchy {',
  '  "root" -1 56 0',
  '}',
  '',
  'bounds {',
  '  ( -1 -1 -1 ) ( 1 1 1 )',
  '  ( -1 -1 -1 ) ( 1 1 1 )',
  '}',
  '',
  'baseframe {',
  '  ( 0 0 0 ) ( 0 0 0 )',
  '}',
  '',
  'frame 0 {',
  '  0 0 0',
  '}',
  '',
  'frame 1 {',
  '  0.5 0.5 0.5',
  '}',
].join('\n');

function makeJoints(count: number): SceneNode[] {
  const nodes: SceneNode[] = [];
  for (let i = 0; i < count; i++) {
    nodes.push(createSceneNode(undefined, { name: `joint${i}` }));
  }
  return nodes;
}

describe('parseMd5Anim', () => {
  it('parses a single static joint from baseframe values', () => {
    const joints = makeJoints(1);
    const clip = parseMd5Anim(SINGLE_JOINT_STATIC, joints);
    expect(clip).not.toBeNull();

    // One joint produces 2 channels (translation + rotation).
    expect(clip!.channels).toHaveLength(2);

    const translationChannel = clip!.channels[0];
    const target = translationChannel.targetRef as SceneAnimationTarget;
    expect(target.node).toBe(joints[0]);
    expect(target.path).toBe(SceneAnimationPathTranslation);

    // Baseframe (5, 10, 15) in Z-up → (5, 15, -10) in Y-up.
    const out = [0, 0, 0];
    sampleAnimationTrack(out, translationChannel.track, 0);
    expect(out[0]).toBeCloseTo(5);
    expect(out[1]).toBeCloseTo(15);
    expect(out[2]).toBeCloseTo(-10);
  });

  it('produces rotation channels targeting SceneAnimationPathRotation', () => {
    const joints = makeJoints(1);
    const clip = parseMd5Anim(SINGLE_JOINT_STATIC, joints)!;

    const rotationChannel = clip.channels[1];
    const target = rotationChannel.targetRef as SceneAnimationTarget;
    expect(target.node).toBe(joints[0]);
    expect(target.path).toBe(SceneAnimationPathRotation);
  });

  it('animates translation across two frames', () => {
    const joints = makeJoints(2);
    const clip = parseMd5Anim(TWO_JOINT_TWO_FRAME, joints)!;

    // First joint (root) has animated position, 4 channels total (2 per joint).
    expect(clip.channels).toHaveLength(4);

    const rootTranslation = clip.channels[0];

    // Frame 0: (0, 0, 0) Z-up -> (0, 0, 0) Y-up.
    const out = [0, 0, 0];
    sampleAnimationTrack(out, rootTranslation.track, 0);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0);
    expect(out[2]).toBeCloseTo(0);

    // Frame 1 at t=1/30: (10, 20, 30) Z-up → (10, 30, -20) Y-up.
    sampleAnimationTrack(out, rootTranslation.track, 1 / 30);
    expect(out[0]).toBeCloseTo(10);
    expect(out[1]).toBeCloseTo(30);
    expect(out[2]).toBeCloseTo(-20);
  });

  it('binds channels to joints by name, not array position', () => {
    // Nodes named to match the hierarchy ("root", "child") but passed in REVERSED order. Index binding
    // would bind the root channel to the child node; name binding must resolve each to its named node —
    // the fix for a caller that collects joints in a different order than MD5 (e.g. depth-first over a
    // nested skeleton, which reorders branches like finger chains).
    const child = createSceneNode(undefined, { name: 'child' });
    const root = createSceneNode(undefined, { name: 'root' });
    const clip = parseMd5Anim(TWO_JOINT_TWO_FRAME, [child, root])!;

    // Channels are [root-translation, root-rotation, child-translation, child-rotation] (hierarchy order).
    expect((clip.channels[0].targetRef as SceneAnimationTarget).node).toBe(root);
    expect((clip.channels[2].targetRef as SceneAnimationTarget).node).toBe(child);
  });

  it('uses baseframe values for unanimated joints', () => {
    const joints = makeJoints(2);
    const clip = parseMd5Anim(TWO_JOINT_TWO_FRAME, joints)!;

    // Second joint (child) has flags=0, so all values come from baseframe (1, 2, 3).
    // Z-up to Y-up: (1, 3, -2).
    const childTranslation = clip.channels[2];
    const out = [0, 0, 0];

    sampleAnimationTrack(out, childTranslation.track, 0);
    expect(out[0]).toBeCloseTo(1);
    expect(out[1]).toBeCloseTo(3);
    expect(out[2]).toBeCloseTo(-2);

    // Same at frame 1 since no components are animated.
    sampleAnimationTrack(out, childTranslation.track, 1 / 30);
    expect(out[0]).toBeCloseTo(1);
    expect(out[1]).toBeCloseTo(3);
    expect(out[2]).toBeCloseTo(-2);
  });

  it('animates rotation and reconstructs quaternion W', () => {
    const joints = makeJoints(1);
    const clip = parseMd5Anim(ANIMATED_ROTATION, joints)!;

    const rotationChannel = clip.channels[1];
    const out = [0, 0, 0, 0];

    // Frame 0: orientation (0, 0, 0), W = -sqrt(1 - 0) = -1.
    // Z-up to Y-up: (qx, qy, qz, qw) → (qx, qz, -qy, qw) = (0, 0, 0, -1).
    sampleAnimationTrack(out, rotationChannel.track, 0);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0);
    expect(out[2]).toBeCloseTo(0);
    expect(out[3]).toBeCloseTo(-1);

    // Frame 1: orientation (0.5, 0.5, 0.5), W = -sqrt(1 - 0.75) = -0.5.
    // Z-up to Y-up: (qx, qy, qz, qw) → (qx, qz, -qy, qw) = (0.5, 0.5, -0.5, -0.5).
    sampleAnimationTrack(out, rotationChannel.track, 1 / 10);
    expect(out[0]).toBeCloseTo(0.5);
    expect(out[1]).toBeCloseTo(0.5);
    expect(out[2]).toBeCloseTo(-0.5);
    expect(out[3]).toBeCloseTo(-0.5);
  });

  it('computes clip duration from frameRate and numFrames', () => {
    const joints = makeJoints(2);
    const clip = parseMd5Anim(TWO_JOINT_TWO_FRAME, joints)!;

    // 2 frames at 30 fps: last keyframe at t = 1/30.
    expect(clip.duration).toBeCloseTo(1 / 30);
  });

  it('returns null for empty input', () => {
    const result = parseMd5Anim('', []);
    expect(result).toBeNull();
  });

  it('returns null for comment-only input', () => {
    const result = parseMd5Anim('// just a comment\n', []);
    expect(result).toBeNull();
  });

  it('returns null when joints array is too short', () => {
    const warnings: string[] = [];
    const result = parseMd5Anim(SINGLE_JOINT_STATIC, [], warnings);
    expect(result).toBeNull();
    expect(warnings.some((w) => w.includes('joints array'))).toBe(true);
  });

  it('warns on malformed hierarchy entries', () => {
    const source = [
      'MD5Version 10',
      'numFrames 1',
      'numJoints 1',
      'frameRate 24',
      'hierarchy {',
      '  bad hierarchy line',
      '}',
      'baseframe {',
      '  ( 0 0 0 ) ( 0 0 0 )',
      '}',
      'frame 0 {',
      '}',
    ].join('\n');

    const warnings: string[] = [];
    parseMd5Anim(source, makeJoints(1), warnings);
    expect(warnings.some((w) => w.includes('malformed hierarchy'))).toBe(true);
  });

  it('warns on malformed baseframe entries', () => {
    const source = [
      'MD5Version 10',
      'numFrames 1',
      'numJoints 1',
      'frameRate 24',
      'hierarchy {',
      '  "root" -1 0 0',
      '}',
      'baseframe {',
      '  ( abc def ) ( 0 0 0 )',
      '}',
      'frame 0 {',
      '}',
    ].join('\n');

    const warnings: string[] = [];
    parseMd5Anim(source, makeJoints(1), warnings);
    expect(warnings.some((w) => w.includes('malformed baseframe'))).toBe(true);
  });

  it('warns on unsupported MD5Version', () => {
    const source = [
      'MD5Version 11',
      'numFrames 1',
      'numJoints 1',
      'frameRate 24',
      'hierarchy {',
      '  "root" -1 0 0',
      '}',
      'baseframe {',
      '  ( 0 0 0 ) ( 0 0 0 )',
      '}',
      'frame 0 {',
      '}',
    ].join('\n');

    const warnings: string[] = [];
    parseMd5Anim(source, makeJoints(1), warnings);
    expect(warnings.some((w) => w.includes('unsupported MD5Version'))).toBe(true);
  });

  it('handles mixed animated components (position and rotation bits)', () => {
    // flags=63 = all 6 bits set (tx+ty+tz+qx+qy+qz).
    const source = [
      'MD5Version 10',
      'commandline ""',
      'numFrames 1',
      'numJoints 1',
      'frameRate 24',
      'numAnimatedComponents 6',
      'hierarchy {',
      '  "root" -1 63 0',
      '}',
      'bounds {',
      '  ( -1 -1 -1 ) ( 1 1 1 )',
      '}',
      'baseframe {',
      '  ( 0 0 0 ) ( 0 0 0 )',
      '}',
      'frame 0 {',
      '  100 200 300 0 0 0',
      '}',
    ].join('\n');

    const joints = makeJoints(1);
    const clip = parseMd5Anim(source, joints)!;
    expect(clip).not.toBeNull();

    // Translation: (100, 200, 300) Z-up → (100, 300, -200) Y-up.
    const out = [0, 0, 0];
    sampleAnimationTrack(out, clip.channels[0].track, 0);
    expect(out[0]).toBeCloseTo(100);
    expect(out[1]).toBeCloseTo(300);
    expect(out[2]).toBeCloseTo(-200);
  });

  it('skips comment lines inside blocks', () => {
    const source = [
      'MD5Version 10',
      'numFrames 1',
      'numJoints 1',
      'frameRate 24',
      'hierarchy {',
      '  // This is a comment',
      '  "root" -1 0 0',
      '}',
      'baseframe {',
      '  // Another comment',
      '  ( 5 10 15 ) ( 0 0 0 )',
      '}',
      'frame 0 {',
      '  // Frame comment',
      '}',
    ].join('\n');

    const warnings: string[] = [];
    const joints = makeJoints(1);
    const clip = parseMd5Anim(source, joints, warnings);
    expect(clip).not.toBeNull();
    expect(warnings).toHaveLength(0);
  });

  it('interpolates translation values between frames', () => {
    const joints = makeJoints(2);
    const clip = parseMd5Anim(TWO_JOINT_TWO_FRAME, joints)!;

    const rootTranslation = clip.channels[0];
    const out = [0, 0, 0];

    // Midpoint: t = 0.5 * (1/30).
    const midTime = 0.5 / 30;
    sampleAnimationTrack(out, rootTranslation.track, midTime);
    // Halfway between (0,0,0) and (10,30,-20) Y-up = (5, 15, -10).
    expect(out[0]).toBeCloseTo(5);
    expect(out[1]).toBeCloseTo(15);
    expect(out[2]).toBeCloseTo(-10);
  });
});
