import { easeCubicBezier } from '@flighthq/easing/contract';
import { collectImportDiagnostics } from '@flighthq/importdiagnostics/contract';
import { applyAnimationClipToSkeleton2D, cloneSkeleton2D } from '@flighthq/skeleton2d/contract';
import type { ImportDiagnostic, MeshAttachment2D, RegionAttachment2D } from '@flighthq/types/contract';
import { MeshAttachment2DKind, RegionAttachment2DKind, TransformMode2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { parseSpineSkeleton } from './spineParse';

// Hand-authored minimal Spine skeleton JSON (per the real-asset rule: committed fixtures are hand-written,
// never transcribed from a licensed rig). Two bones: a root, and a child that sets every transform field.
const SPINE_TWO_BONES = JSON.stringify({
  skeleton: { spine: '4.1', hash: 'x' },
  bones: [
    { name: 'root' },
    {
      name: 'arm',
      parent: 'root',
      length: 50,
      x: 10,
      y: 20,
      rotation: 45,
      scaleX: 2,
      scaleY: 3,
      shearX: 5,
      shearY: 6,
      transform: 'onlyTranslation',
    },
  ],
});

describe('parseSpineSkeleton', () => {
  it('parses the bone hierarchy: names, parent resolution, TRS, and transform mode', () => {
    const result = parseSpineSkeleton(SPINE_TWO_BONES);
    expect(result).not.toBeNull();
    const bones = result!.skeleton.bones;
    expect(bones.length).toBe(2);
    expect(bones[0].name).toBe('root');
    expect(bones[0].parentIndex).toBe(-1);
    expect(bones[0].transformMode).toBe(TransformMode2D.Normal);

    const arm = bones[1];
    expect(arm.name).toBe('arm');
    expect(arm.parentIndex).toBe(0); // 'root' resolved to index 0
    expect(arm.length).toBe(50);
    expect(arm.x).toBe(10);
    expect(arm.y).toBe(20);
    expect(arm.rotation).toBe(45);
    expect(arm.scaleX).toBe(2);
    expect(arm.scaleY).toBe(3);
    expect(arm.shearX).toBe(5);
    expect(arm.shearY).toBe(6);
    expect(arm.transformMode).toBe(TransformMode2D.OnlyTranslation);
  });

  it('applies Spine defaults for omitted bone fields', () => {
    const bones = parseSpineSkeleton(JSON.stringify({ bones: [{ name: 'b' }] }))!.skeleton.bones;
    expect(bones[0]).toMatchObject({
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      shearX: 0,
      shearY: 0,
      length: 0,
      parentIndex: -1,
      transformMode: TransformMode2D.Normal,
    });
  });

  it('maps every Spine transform-mode string', () => {
    const doc = {
      bones: [
        { name: 'a', transform: 'noRotationOrReflection' },
        { name: 'b', transform: 'noScale' },
        { name: 'c', transform: 'noScaleOrReflection' },
        { name: 'd', transform: 'bogus' },
      ],
    };
    const bones = parseSpineSkeleton(JSON.stringify(doc))!.skeleton.bones;
    expect(bones[0].transformMode).toBe(TransformMode2D.NoRotationOrReflection);
    expect(bones[1].transformMode).toBe(TransformMode2D.NoScale);
    expect(bones[2].transformMode).toBe(TransformMode2D.NoScaleOrReflection);
    expect(bones[3].transformMode).toBe(TransformMode2D.Normal); // unknown → default
  });

  it('returns null for malformed JSON and for a non-object document', () => {
    expect(parseSpineSkeleton('{ not json')).toBeNull();
    expect(parseSpineSkeleton('42')).toBeNull();
    expect(parseSpineSkeleton('null')).toBeNull();
  });

  it('best-efforts an empty skeleton when bones are missing', () => {
    const result = parseSpineSkeleton(JSON.stringify({ skeleton: { spine: '4.1' } }));
    expect(result).not.toBeNull();
    expect(result!.skeleton.bones.length).toBe(0);
    expect(result!.animations).toEqual([]);
  });

  it('parses slots with resolved bone index, draw-order, region attachment, and color', () => {
    const doc = {
      bones: [{ name: 'root' }, { name: 'armBone', parent: 'root' }],
      slots: [{ name: 'arm', bone: 'armBone', attachment: 'armImage', color: '80c0ffff' }],
      skins: [
        {
          name: 'default',
          attachments: { arm: { armImage: { type: 'region', x: 1, y: 2, rotation: 30, width: 40, height: 20 } } },
        },
      ],
    };
    const slots = parseSpineSkeleton(JSON.stringify(doc))!.skeleton.slots!;
    expect(slots.length).toBe(1);
    expect(slots[0].name).toBe('arm');
    expect(slots[0].boneIndex).toBe(1); // 'armBone' resolved
    expect(slots[0].color).toBe(0x80c0ffff);
    const region = slots[0].attachment as RegionAttachment2D;
    expect(region.kind).toBe(RegionAttachment2DKind);
    expect(region).toMatchObject({ x: 1, y: 2, rotation: 30, width: 40, height: 20, scaleX: 1, scaleY: 1 });
  });

  it('parses an unweighted mesh attachment (positions local to the bone, skin null)', () => {
    const doc = {
      bones: [{ name: 'root' }],
      slots: [{ name: 's', bone: 'root', attachment: 'm' }],
      skins: [
        {
          name: 'default',
          attachments: {
            s: { m: { type: 'mesh', uvs: [0, 0, 1, 0, 1, 1], triangles: [0, 1, 2], vertices: [0, 0, 10, 0, 10, 10] } },
          },
        },
      ],
    };
    const mesh = parseSpineSkeleton(JSON.stringify(doc))!.skeleton.slots![0].attachment as MeshAttachment2D;
    expect(mesh.kind).toBe(MeshAttachment2DKind);
    expect(mesh.skin).toBeNull();
    expect(mesh.vertexCount).toBe(3);
    expect(Array.from(mesh.vertices!)).toEqual([0, 0, 10, 0, 10, 10]);
    expect(Array.from(mesh.triangles)).toEqual([0, 1, 2]);
  });

  it('parses a weighted mesh attachment into a Skin2D influence stream', () => {
    // 1 vertex, 2 influences: bone 0 offset (1,2) w0.25, bone 1 offset (3,4) w0.75. uvs give vertexCount=1.
    const doc = {
      bones: [{ name: 'a' }, { name: 'b' }],
      slots: [{ name: 's', bone: 'a', attachment: 'm' }],
      skins: [
        {
          name: 'default',
          attachments: {
            s: { m: { type: 'mesh', uvs: [0, 0], triangles: [], vertices: [2, 0, 1, 2, 0.25, 1, 3, 4, 0.75] } },
          },
        },
      ],
    };
    const mesh = parseSpineSkeleton(JSON.stringify(doc))!.skeleton.slots![0].attachment as MeshAttachment2D;
    expect(mesh.vertices).toBeNull();
    expect(mesh.skin).not.toBeNull();
    expect(Array.from(mesh.skin!.influenceCounts)).toEqual([2]);
    expect(Array.from(mesh.skin!.influences)).toEqual([0, 1, 2, 0.25, 1, 3, 4, 0.75]);
  });

  it('recovers a malformed bone as an aligned placeholder so file-order indices stay valid (read-integrity axis 12)', () => {
    // The bone array is positionally referenced by weighted-mesh influences, so a malformed entry must hold
    // its slot rather than drop — else every later bone shifts and those indices point at the wrong bone.
    const doc = { bones: [{ name: 'a' }, null, { name: 'c' }] };
    const crumbs: ImportDiagnostic[] = collectImportDiagnostics((sink) =>
      parseSpineSkeleton(JSON.stringify(doc), sink),
    );
    const bones = parseSpineSkeleton(JSON.stringify(doc))!.skeleton.bones;
    expect(bones.length).toBe(3); // placeholder holds index 1
    expect(bones[0].name).toBe('a');
    expect(bones[1].name).toBeNull(); // inert placeholder
    expect(bones[2].name).toBe('c'); // still at index 2 — NOT shifted down to 1
    expect(crumbs.map((c) => c.kind)).toContain('spine.malformed-bone-recovered');
  });

  it('bounds a weighted-vertex stream against its actual length instead of reading past it (read-integrity axis 13)', () => {
    // vertexCount = 1 (from uvs); the stream declares boneCount 5 but supplies only one (boneIndex,x,y,weight)
    // quad. The declared count is clamped to what the stream actually holds — no undefined→NaN, no runaway loop.
    const doc = {
      bones: [{ name: 'a' }],
      slots: [{ name: 's', bone: 'a', attachment: 'm' }],
      skins: [
        {
          name: 'default',
          attachments: { s: { m: { type: 'mesh', uvs: [0, 0], triangles: [], vertices: [5, 0, 1, 2, 0.25] } } },
        },
      ],
    };
    const crumbs: ImportDiagnostic[] = collectImportDiagnostics((sink) =>
      parseSpineSkeleton(JSON.stringify(doc), sink),
    );
    const mesh = parseSpineSkeleton(JSON.stringify(doc))!.skeleton.slots![0].attachment as MeshAttachment2D;
    expect(Array.from(mesh.skin!.influenceCounts)).toEqual([1]); // clamped 5 → 1
    expect(Array.from(mesh.skin!.influences)).toEqual([0, 1, 2, 0.25]); // exactly the one available quad
    expect(crumbs.map((c) => c.kind)).toContain('spine.weighted-vertices-truncated');
  });

  it('Skip-crumbs an unmodeled attachment type and an alternate skin', () => {
    const doc = {
      bones: [{ name: 'root' }],
      slots: [{ name: 's', bone: 'root', attachment: 'clip' }],
      skins: [
        { name: 'default', attachments: { s: { clip: { type: 'clipping', end: 's', vertexCount: 4, vertices: [] } } } },
        { name: 'costume2', attachments: {} },
      ],
    };
    const crumbs: ImportDiagnostic[] = collectImportDiagnostics((sink) =>
      parseSpineSkeleton(JSON.stringify(doc), sink),
    );
    expect(crumbs.map((c) => c.kind)).toContain('spine.clipping-attachment-unsupported');
    expect(crumbs.map((c) => c.kind)).toContain('spine.alternate-skin-unsupported');
    // The clipping attachment was dropped (not shown on the slot).
    expect(parseSpineSkeleton(JSON.stringify(doc))!.skeleton.slots![0].attachment).toBeNull();
  });

  it('builds a named animation clip of RELATIVE deltas that compose onto the setup pose', () => {
    const doc = {
      bones: [{ name: 'b', rotation: 10, x: 5, scaleX: 2 }],
      animations: {
        walk: {
          bones: {
            b: {
              rotate: [
                { time: 0, value: 0 },
                { time: 1, value: 90 },
              ],
              translate: [
                { time: 0, x: 0, y: 0 },
                { time: 1, x: 20, y: 0 },
              ],
              scale: [
                { time: 0, x: 1, y: 1 },
                { time: 1, x: 3, y: 1 },
              ],
            },
          },
        },
      },
    };
    const result = parseSpineSkeleton(JSON.stringify(doc))!;
    expect(result.animations.length).toBe(1);
    expect(result.animations[0].name).toBe('walk');
    // Compose the clip onto a pose clone at t=1. The end result is identical to the old setup-baked
    // encoding — rotation 10+90, x 5+20, scaleX 2*3 — confirming the relative-delta switch is numerically
    // neutral on the original rig; the win is portability/blending, not different numbers.
    const setup = result.skeleton;
    const pose = cloneSkeleton2D(setup);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, setup, pose, 1);
    expect(pose.bones[0].rotation).toBeCloseTo(100, 5);
    expect(pose.bones[0].x).toBeCloseTo(25, 5);
    expect(pose.bones[0].scaleX).toBeCloseTo(6, 5); // multiplier: setup 2 × 3
    expect(setup.bones[0].rotation).toBe(10); // the parsed setup pose is left intact
  });

  it('uses Step interpolation when every keyframe of a timeline is stepped', () => {
    const doc = {
      bones: [{ name: 'b' }],
      animations: {
        a: {
          bones: {
            b: {
              rotate: [
                { time: 0, value: 0, curve: 'stepped' },
                { time: 1, value: 90, curve: 'stepped' },
              ],
            },
          },
        },
      },
    };
    const result = parseSpineSkeleton(JSON.stringify(doc))!;
    const pose = cloneSkeleton2D(result.skeleton);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, result.skeleton, pose, 0.9);
    expect(pose.bones[0].rotation).toBeCloseTo(0, 5); // stepped holds the t=0 keyframe (delta 0) until t=1
  });

  it('HONORS a bezier curve keyframe, rebasing its absolute control points onto the segment', () => {
    // Spine writes control points in ABSOLUTE time/value units, so the CSS ease-in curve (0.42, 0, 1, 1)
    // over a 0..1s / 0..90deg segment is written as [0.42, 0, 1, 90]. A linear read would give 45 at the
    // midpoint; the curve must bend it well below that.
    const doc = curveDoc([
      { time: 0, value: 0, curve: [0.42, 0, 1, 90] },
      { time: 1, value: 90 },
    ]);
    const result = parseSpineSkeleton(JSON.stringify(doc))!;
    const pose = cloneSkeleton2D(result.skeleton);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, result.skeleton, pose, 0.5);
    expect(pose.bones[0].rotation).toBeCloseTo(90 * easeCubicBezier(0.42, 0, 1, 1)(0.5), 4);
    expect(pose.bones[0].rotation).toBeLessThan(40); // materially different from the linear 45
    // Endpoints stay exact whatever the curve does between them.
    applyAnimationClipToSkeleton2D(result.animations[0].clip, result.skeleton, pose, 1);
    expect(pose.bones[0].rotation).toBeCloseTo(90, 5);
  });

  it('does NOT report divergence when components share a curve SHAPE across different value ranges', () => {
    // x spans 0..10 and y spans 0..20, so the same shape is written with different raw `cy` numbers.
    // Comparing raw numbers would cry divergence on nearly every translate timeline; comparing the
    // NORMALIZED points is what makes this correct.
    const doc = curveDoc(
      [
        { time: 0, x: 0, y: 0, curve: [0.42, 0, 1, 10, 0.42, 0, 1, 20] },
        { time: 1, x: 10, y: 20 },
      ],
      'translate',
    );
    const kinds = collectImportDiagnostics((sink) => parseSpineSkeleton(JSON.stringify(doc), sink)).map((c) => c.kind);
    expect(kinds).not.toContain('spine.per-component-curve-easing-unsupported');
  });

  it('Skip-crumbs a genuinely divergent per-component curve, and the FIRST component wins', () => {
    const doc = curveDoc(
      [
        { time: 0, x: 0, y: 0, curve: [0.42, 0, 1, 10, 0.1, 0, 0.9, 20] },
        { time: 1, x: 10, y: 20 },
      ],
      'translate',
    );
    const crumbs = collectImportDiagnostics((sink) => parseSpineSkeleton(JSON.stringify(doc), sink)).filter(
      (c) => c.kind === 'spine.per-component-curve-easing-unsupported',
    );
    expect(crumbs.length).toBe(1);
    expect(crumbs[0].detail).toMatchObject({ segments: 1 });
    const result = parseSpineSkeleton(JSON.stringify(doc))!;
    const pose = cloneSkeleton2D(result.skeleton);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, result.skeleton, pose, 0.5);
    // Both components ride x's curve — that is the documented cost of one easing per interval.
    const alpha = easeCubicBezier(0.42, 0, 1, 1)(0.5);
    expect(pose.bones[0].x).toBeCloseTo(10 * alpha, 4);
    expect(pose.bones[0].y).toBeCloseTo(20 * alpha, 4);
  });

  it('skips a CONSTANT component when choosing the winning curve', () => {
    // x never moves, so its curve carries no shape and rebasing it would divide by zero. y must win.
    const doc = curveDoc(
      [
        { time: 0, x: 0, y: 0, curve: [0, 0, 1, 0, 0.42, 0, 1, 20] },
        { time: 1, x: 0, y: 20 },
      ],
      'translate',
    );
    const result = parseSpineSkeleton(JSON.stringify(doc))!;
    const pose = cloneSkeleton2D(result.skeleton);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, result.skeleton, pose, 0.5);
    expect(pose.bones[0].y).toBeCloseTo(20 * easeCubicBezier(0.42, 0, 1, 1)(0.5), 4);
    const kinds = collectImportDiagnostics((sink) => parseSpineSkeleton(JSON.stringify(doc), sink)).map((c) => c.kind);
    expect(kinds).not.toContain('spine.per-component-curve-easing-unsupported');
  });

  it('leaves an uncurved timeline with no segment easings at all', () => {
    const doc = curveDoc([
      { time: 0, value: 0 },
      { time: 1, value: 90 },
    ]);
    const result = parseSpineSkeleton(JSON.stringify(doc))!;
    expect(result.animations[0].clip.channels[0].track.segmentEasings).toBeNull();
    const pose = cloneSkeleton2D(result.skeleton);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, result.skeleton, pose, 0.5);
    expect(pose.bones[0].rotation).toBeCloseTo(45, 5); // plain linear
  });

  it('CLAMPS a control point that overshoots its segment in time, and records the loss', () => {
    // cx1 = -0.5 sits before the segment starts, which Spine allows but a CSS-style bezier cannot invert.
    const doc = curveDoc([
      { time: 0, value: 0, curve: [-0.5, 0, 1, 90] },
      { time: 1, value: 90 },
    ]);
    const crumbs = collectImportDiagnostics((sink) => parseSpineSkeleton(JSON.stringify(doc), sink)).filter(
      (c) => c.kind === 'spine.curve-time-overshoot-clamped',
    );
    expect(crumbs.length).toBe(1);
    expect(crumbs[0].detail).toMatchObject({ segments: 1 });
    // It still produces a usable, finite easing rather than NaN.
    const result = parseSpineSkeleton(JSON.stringify(doc))!;
    const pose = cloneSkeleton2D(result.skeleton);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, result.skeleton, pose, 0.5);
    expect(Number.isFinite(pose.bones[0].rotation)).toBe(true);
    expect(pose.bones[0].rotation).toBeGreaterThan(0);
  });

  it('leaves a y overshoot UNCLAMPED, since anticipation is legitimate', () => {
    // cy1 below the start value is an anticipation curve — the pose dips below 0 before rising.
    const doc = curveDoc([
      { time: 0, value: 0, curve: [0.25, -45, 0.75, 90] },
      { time: 1, value: 90 },
    ]);
    const kinds = collectImportDiagnostics((sink) => parseSpineSkeleton(JSON.stringify(doc), sink)).map((c) => c.kind);
    expect(kinds).not.toContain('spine.curve-time-overshoot-clamped');
    const result = parseSpineSkeleton(JSON.stringify(doc))!;
    const pose = cloneSkeleton2D(result.skeleton);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, result.skeleton, pose, 0.15);
    expect(pose.bones[0].rotation).toBeLessThan(0);
  });

  it('Skip-crumbs constraint, event, and slot animation timelines', () => {
    const doc = {
      bones: [{ name: 'b' }],
      animations: {
        a: { bones: {}, ik: { c1: [] }, transform: { t1: [] }, events: [{ time: 0, name: 'e' }], slots: { s: {} } },
      },
    };
    const kinds = collectImportDiagnostics((sink) => parseSpineSkeleton(JSON.stringify(doc), sink)).map((c) => c.kind);
    expect(kinds).toContain('spine.ik-timeline-unsupported');
    expect(kinds).toContain('spine.transform-timeline-unsupported');
    expect(kinds).toContain('spine.event-timeline-unsupported');
    expect(kinds).toContain('spine.slot-timeline-unsupported');
  });
});

// A one-bone document whose single animation carries `keys` as bone `b`'s timeline of the given kind.
function curveDoc(keys: readonly Record<string, unknown>[], kind = 'rotate'): Record<string, unknown> {
  return { bones: [{ name: 'b' }], animations: { a: { bones: { b: { [kind]: keys } } } } };
}
