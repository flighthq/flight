import { sampleAnimationTrack } from '@flighthq/animation/contract';
import { createNode3D } from '@flighthq/scene3d/contract';
import type { AnimationClip, ImportDiagnostic, Scene3DAnimationTarget, Node3D } from '@flighthq/types/contract';
import {
  ImportDiagnosticSeverity,
  Scene3DAnimationPathRotation,
  Scene3DAnimationPathTranslation,
} from '@flighthq/types/contract';

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

function makeJoints(count: number): Node3D[] {
  const nodes: Node3D[] = [];
  for (let i = 0; i < count; i++) {
    nodes.push(createNode3D(undefined, { name: `joint${i}` }));
  }
  return nodes;
}

function findDiagnostic(diagnostics: readonly ImportDiagnostic[], kind: string): ImportDiagnostic | undefined {
  return diagnostics.find((diagnostic) => diagnostic.kind === kind);
}

describe('parseMd5Anim', () => {
  // A clean parse is two claims: the values are right AND THE PARSER IS NOT COMPLAINING. Every other test
  // here checks the first. This checks the second — the one that catches a frame walk that desynchronised
  // and still produced channels whose asserted values happen to look right. This importer has eight ways to
  // say it lost its place in the frame data and, until this test, no assertion that a good file trips none
  // of them.
  it('raises no diagnostic at all for a well-formed animation', () => {
    const diagnostics: ImportDiagnostic[] = [];

    parseMd5Anim(TWO_JOINT_TWO_FRAME, makeJoints(2), diagnostics);

    // Skip is excluded rather than the list asserted empty: a well-formed .md5anim carries a bounds block,
    // which this importer recognizes and deliberately does not model. That is correct behaviour on correct
    // input. What must not appear is anything of higher severity.
    const integrity = diagnostics.filter((diagnostic) => diagnostic.severity !== ImportDiagnosticSeverity.Skip);
    expect(
      integrity.map((diagnostic) => diagnostic.kind),
      `a good md5anim file made the parser complain: ${integrity.map((d) => d.kind).join(', ')}`,
    ).toEqual([]);
  });

  it('parses a single static joint from baseframe values', () => {
    const joints = makeJoints(1);
    const clip = parseMd5Anim(SINGLE_JOINT_STATIC, joints);
    expect(clip).not.toBeNull();

    // One joint produces 2 channels (translation + rotation).
    expect(clip!.channels).toHaveLength(2);

    const translationChannel = clip!.channels[0];
    const target = translationChannel.targetRef as Scene3DAnimationTarget;
    expect(target.node).toBe(joints[0]);
    expect(target.path).toBe(Scene3DAnimationPathTranslation);

    // Baseframe (5, 10, 15) in Z-up → (5, 15, -10) in Y-up.
    const out = [0, 0, 0];
    sampleAnimationTrack(out, translationChannel.track, 0);
    expect(out[0]).toBeCloseTo(5);
    expect(out[1]).toBeCloseTo(15);
    expect(out[2]).toBeCloseTo(-10);
  });

  it('produces rotation channels targeting Scene3DAnimationPathRotation', () => {
    const joints = makeJoints(1);
    const clip = parseMd5Anim(SINGLE_JOINT_STATIC, joints)!;

    const rotationChannel = clip.channels[1];
    const target = rotationChannel.targetRef as Scene3DAnimationTarget;
    expect(target.node).toBe(joints[0]);
    expect(target.path).toBe(Scene3DAnimationPathRotation);
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
    const child = createNode3D(undefined, { name: 'child' });
    const root = createNode3D(undefined, { name: 'root' });
    const clip = parseMd5Anim(TWO_JOINT_TWO_FRAME, [child, root])!;

    // Channels are [root-translation, root-rotation, child-translation, child-rotation] (hierarchy order).
    expect((clip.channels[0].targetRef as Scene3DAnimationTarget).node).toBe(root);
    expect((clip.channels[2].targetRef as Scene3DAnimationTarget).node).toBe(child);
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

  it('rejects and reports md5anim.joints-too-few when the joints array is too short', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const result = parseMd5Anim(SINGLE_JOINT_STATIC, [], diagnostics);
    expect(result).toBeNull();
    const crumb = findDiagnostic(diagnostics, 'md5anim.joints-too-few');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Reject);
    expect(crumb!.origin).toBe('parseMd5Anim');
    expect(crumb!.detail).toEqual({ animationJoints: 1, suppliedJoints: 0 });
  });

  it('drops and reports a consumed bounds block without attaching oracle evidence', () => {
    const diagnostics: ImportDiagnostic[] = [];

    expect(parseMd5Anim(SINGLE_JOINT_STATIC, makeJoints(1), diagnostics)).not.toBeNull();
    expect(diagnostics).toEqual([
      {
        kind: 'md5anim.bounds-discarded',
        origin: 'parseMd5Anim',
        // Skip: a recognized-but-unmodelled block on a well-formed file is a capability gap, not lost data.
        severity: ImportDiagnosticSeverity.Skip,
      },
    ]);
  });

  it('drops and reports md5anim.malformed-hierarchy for a bad hierarchy entry', () => {
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

    const diagnostics: ImportDiagnostic[] = [];
    parseMd5Anim(source, makeJoints(1), diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5anim.malformed-hierarchy');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('parseMd5Anim');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.reason).toBe('missing-name-quotes');
    expect(crumb!.detail?.firstLine).toBe(6);
  });

  it('drops and reports md5anim.malformed-baseframe for a bad baseframe entry', () => {
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

    const diagnostics: ImportDiagnostic[] = [];
    parseMd5Anim(source, makeJoints(1), diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5anim.malformed-baseframe');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('parseMd5Anim');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.reason).toBe('not-enough-components');
  });

  it('recovers and reports md5anim.unsupported-version', () => {
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

    const diagnostics: ImportDiagnostic[] = [];
    parseMd5Anim(source, makeJoints(1), diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5anim.unsupported-version');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parseMd5Anim');
    expect(crumb!.detail).toEqual({ version: 11 });
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

    const diagnostics: ImportDiagnostic[] = [];
    const joints = makeJoints(1);
    const clip = parseMd5Anim(source, joints, diagnostics);
    expect(clip).not.toBeNull();
    expect(diagnostics).toHaveLength(0);
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

  it('recovers and reports md5anim.non-numeric-numframes', () => {
    const source = [
      'MD5Version 10',
      'numFrames xx',
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

    const diagnostics: ImportDiagnostic[] = [];
    parseMd5Anim(source, makeJoints(1), diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5anim.non-numeric-numframes');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parseMd5Anim');
  });

  it('recovers and reports md5anim.non-numeric-numjoints', () => {
    const source = [
      'MD5Version 10',
      'numFrames 1',
      'numJoints zz',
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

    const diagnostics: ImportDiagnostic[] = [];
    parseMd5Anim(source, makeJoints(1), diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5anim.non-numeric-numjoints');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parseMd5Anim');
  });

  it('recovers and reports md5anim.invalid-framerate', () => {
    const source = [
      'MD5Version 10',
      'numFrames 1',
      'numJoints 1',
      'frameRate 0',
      'hierarchy {',
      '  "root" -1 0 0',
      '}',
      'baseframe {',
      '  ( 0 0 0 ) ( 0 0 0 )',
      '}',
      'frame 0 {',
      '}',
    ].join('\n');

    const diagnostics: ImportDiagnostic[] = [];
    parseMd5Anim(source, makeJoints(1), diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5anim.invalid-framerate');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parseMd5Anim');
  });

  it('rejects and reports md5anim.no-data when no hierarchy or frame data is present', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const result = parseMd5Anim('MD5Version 10\nnumFrames 0\nnumJoints 0\n', makeJoints(1), diagnostics);
    expect(result).toBeNull();
    const crumb = findDiagnostic(diagnostics, 'md5anim.no-data');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Reject);
    expect(crumb!.origin).toBe('parseMd5Anim');
  });

  it('recovers and reports md5anim.joint-count-mismatch with declared/found detail', () => {
    const source = [
      'MD5Version 10',
      'numFrames 1',
      'numJoints 5',
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

    const diagnostics: ImportDiagnostic[] = [];
    parseMd5Anim(source, makeJoints(1), diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5anim.joint-count-mismatch');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parseMd5Anim');
    expect(crumb!.detail).toEqual({ declared: 5, found: 1 });
  });

  it('recovers and reports md5anim.frame-count-mismatch with declared/found detail', () => {
    const source = [
      'MD5Version 10',
      'numFrames 9',
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

    const diagnostics: ImportDiagnostic[] = [];
    parseMd5Anim(source, makeJoints(1), diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5anim.frame-count-mismatch');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parseMd5Anim');
    expect(crumb!.detail).toEqual({ declared: 9, found: 1 });
  });

  it('recovers and reports md5anim.hierarchy-block-unclosed', () => {
    const source = [
      'MD5Version 10',
      'numFrames 1',
      'numJoints 1',
      'frameRate 24',
      'hierarchy {',
      '  "root" -1 0 0',
    ].join('\n');
    const diagnostics: ImportDiagnostic[] = [];
    parseMd5Anim(source, makeJoints(1), diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5anim.hierarchy-block-unclosed');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parseMd5Anim');
  });

  it('recovers and reports md5anim.baseframe-block-unclosed', () => {
    const source = [
      'MD5Version 10',
      'numFrames 1',
      'numJoints 1',
      'frameRate 24',
      'hierarchy {',
      '  "root" -1 0 0',
      '}',
      'baseframe {',
      '  ( 0 0 0 ) ( 0 0 0 )',
    ].join('\n');
    const diagnostics: ImportDiagnostic[] = [];
    parseMd5Anim(source, makeJoints(1), diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5anim.baseframe-block-unclosed');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parseMd5Anim');
  });

  it('substitutes and reports md5anim.non-numeric-frame-value, keeping the frame aligned', () => {
    // Recover rather than Drop, and the change is deliberate: the bad token is replaced with a
    // placeholder so the components after it keep their positions. Every joint reads this frame at a
    // fixed startIndex, so skipping the token would shift the rest of the frame and joints would start
    // reading each other's translations as rotations. The frame survives with one wrong component that
    // the crumb names — a usable survivor, which is what Recover means.
    const source = [
      'MD5Version 10',
      'numFrames 1',
      'numJoints 1',
      'frameRate 24',
      'hierarchy {',
      '  "root" -1 63 0',
      '}',
      'baseframe {',
      '  ( 0 0 0 ) ( 0 0 0 )',
      '}',
      'frame 0 {',
      '  1 2 nope 4 5 6',
      '}',
    ].join('\n');

    const diagnostics: ImportDiagnostic[] = [];
    parseMd5Anim(source, makeJoints(1), diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5anim.non-numeric-frame-value');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parseMd5Anim');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.firstToken).toBe('nope');
  });

  it('recovers and reports md5anim.frame-block-unclosed', () => {
    const source = [
      'MD5Version 10',
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
      '  0 0 0',
    ].join('\n');
    const diagnostics: ImportDiagnostic[] = [];
    parseMd5Anim(source, makeJoints(1), diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5anim.frame-block-unclosed');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parseMd5Anim');
  });

  it('aggregates repeated malformed-hierarchy drops into one crumb with a count', () => {
    const source = [
      'MD5Version 10',
      'numFrames 1',
      'numJoints 1',
      'frameRate 24',
      'hierarchy {',
      '  bad one',
      '  bad two',
      '  bad three',
      '  "root" -1 0 0',
      '}',
      'baseframe {',
      '  ( 0 0 0 ) ( 0 0 0 )',
      '}',
      'frame 0 {',
      '}',
    ].join('\n');

    const diagnostics: ImportDiagnostic[] = [];
    parseMd5Anim(source, makeJoints(1), diagnostics);
    const matching = diagnostics.filter((d) => d.kind === 'md5anim.malformed-hierarchy');
    expect(matching).toHaveLength(1);
    expect(matching[0].detail?.count).toBe(3);
    expect(matching[0].detail?.firstLine).toBe(6);
  });

  it('emits no diagnostics when no collector array is supplied', () => {
    const source = [
      'MD5Version 11',
      'numFrames 9',
      'numJoints 5',
      'frameRate 0',
      'hierarchy {',
      '  bad line',
      '  "root" -1 0 0',
    ].join('\n');
    // Exercising every crumb path without a sink must not throw and must be side-effect-free.
    expect(() => parseMd5Anim(source, makeJoints(1))).not.toThrow();
  });
});

describe('parseMd5Anim frame alignment', () => {
  it('keeps the components after a bad token at their own positions', () => {
    // The axis-12 class one scope down from the mesh records. Every joint reads a frame at a fixed
    // startIndex, so skipping a malformed token shifts every component after it WITHIN that frame — joint
    // 1 then reads joint 0's trailing rotation as its own translation, in one frame of an otherwise
    // correct clip. Two joints, six components each; the bad token is in joint 0's block, and joint 1 must
    // still read the values authored for it.
    const source = [
      'MD5Version 10',
      'numFrames 1',
      'numJoints 2',
      'frameRate 24',
      'numAnimatedComponents 12',
      'hierarchy {',
      '  "root" -1 63 0',
      '  "child" 0 63 6',
      '}',
      'baseframe {',
      '  ( 0 0 0 ) ( 0 0 0 )',
      '  ( 0 0 0 ) ( 0 0 0 )',
      '}',
      'frame 0 {',
      '  1 2 nope 0 0 0',
      '  70 80 90 0 0 0',
      '}',
    ].join('\n');

    const diagnostics: ImportDiagnostic[] = [];
    const clip = parseMd5Anim(source, makeJoints(2), diagnostics);
    expect(findDiagnostic(diagnostics, 'md5anim.non-numeric-frame-value')).toBeDefined();
    expect(clip).not.toBeNull();
    // Joint 1's translation channel must carry ITS authored values, not joint 0's shifted tail.
    // Z-up (70,80,90) becomes Y-up (70,90,-80).
    const out = [0, 0, 0];
    sampleAnimationTrack(out, clip!.channels[2].track, 0);
    expect(out[0]).toBeCloseTo(70);
    expect(out[1]).toBeCloseTo(90);
    expect(out[2]).toBeCloseTo(-80);
  });
});
