import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation/contract';
import { easeCubicBezier } from '@flighthq/easing/contract';
import { collectImportDiagnostics } from '@flighthq/importdiagnostics/contract';
import {
  applyAnimationClipToSkeleton2D,
  cloneSkeleton2D,
  getSkeleton2DSkin,
  setSkeleton2DSkin,
} from '@flighthq/skeleton2d/contract';
import type { ImportDiagnostic, MeshAttachment2D, RegionAttachment2D, Slot2D } from '@flighthq/types/contract';
import {
  AnimationInterpolationLinear,
  ImportDiagnosticSeverity,
  MeshAttachment2DKind,
  RegionAttachment2DKind,
  TransformMode2D,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { parseSpineSkeleton, parseSpineDrawOrderTimeline } from './spineParse';

// Hand-authored minimal Spine skeleton JSON (per the real-asset rule: committed fixtures are hand-written,
// never transcribed from an external rig). Two bones: a root, and a child that sets every transform field.
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

// A draw-order keyframe states only the slots that MOVE; everything else keeps its relative order and
// closes the gaps. Each keyframe resolves to a WHOLE ordering, because a track has to answer what is in
// effect at time t from one keyframe alone.
// A document reaching every structure the importer's type guards protect: bones, slots, skins with
// attachments, constraints, events, and an animation carrying bone, slot, deform and draw-order
// timelines. Rich on purpose — a type sweep is only as wide as the document it walks.
const SPINE_RICH = {
  animations: {
    walk: {
      bones: {
        arm: {
          rotate: [
            { time: 0, value: 0 },
            { curve: 'stepped', time: 1, value: 90 },
          ],
        },
      },
      deform: { default: { body: { mesh: [{ offset: 1, time: 0, vertices: [1, 2] }] } } },
      drawOrder: [{ offsets: [{ offset: 1, slot: 'body' }], time: 0 }],
      events: [{ name: 'step', time: 0.5 }],
      slots: { body: { attachment: [{ name: 'mesh', time: 0 }], color: [{ color: 'ffffffff', time: 0 }] } },
    },
  },
  bones: [{ name: 'root' }, { length: 50, name: 'arm', parent: 'root', rotation: 45, x: 10 }],
  events: { step: { float: 1, int: 2, string: 'x' } },
  ik: [{ bones: ['arm'], name: 'aim', target: 'root' }],
  path: [{ bones: ['arm'], name: 'follow', target: 'body' }],
  skeleton: { hash: 'x', spine: '4.1' },
  skins: [
    {
      attachments: {
        body: { mesh: { triangles: [0, 1, 2], type: 'mesh', uvs: [0, 0, 1, 0, 1, 1], vertices: [0, 0, 1, 0, 1, 1] } },
      },
      name: 'default',
    },
  ],
  slots: [{ attachment: 'mesh', bone: 'root', color: 'ffffffff', name: 'body' }],
  transform: [{ bones: ['arm'], name: 'aim2', target: 'root' }],
};

// Every path to a value in `doc`, leaves and containers alike.
function everyJsonPath(node: unknown, prefix: readonly (string | number)[] = []): (string | number)[][] {
  const here: (string | number)[][] = prefix.length > 0 ? [[...prefix]] : [];
  if (Array.isArray(node)) {
    node.forEach((child, i) => here.push(...everyJsonPath(child, [...prefix, i])));
  } else if (node !== null && typeof node === 'object') {
    for (const [key, child] of Object.entries(node)) here.push(...everyJsonPath(child, [...prefix, key]));
  }
  return here;
}

function withValueAt(doc: unknown, path: readonly (string | number)[], value: unknown): unknown {
  const copy: any = Array.isArray(doc) ? [...doc] : { ...(doc as object) };
  let node = copy;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    node[key] = Array.isArray(node[key]) ? [...node[key]] : { ...node[key] };
    node = node[key];
  }
  node[path[path.length - 1]] = value;
  return copy;
}

describe('parseSpineDrawOrderTimeline', () => {
  const SLOTS = [slot('a'), slot('b'), slot('c')];

  it('returns null when the animation states no draw-order timeline', () => {
    expect(parseSpineDrawOrderTimeline(undefined, SLOTS)).toBeNull();
    expect(parseSpineDrawOrderTimeline([], SLOTS)).toBeNull();
  });

  it('keeps the setup order when a keyframe moves nothing', () => {
    const timeline = parseSpineDrawOrderTimeline([{ offsets: [], time: 0 }], SLOTS)!;

    expect(timeline.times).toEqual([0]);
    expect(timeline.orderings).toEqual([0, 1, 2]);
  });

  it('moves a slot by its offset and closes the gap with the rest in setup order', () => {
    // c moves back two places; a and b keep their relative order and shuffle up.
    const timeline = parseSpineDrawOrderTimeline([{ offsets: [{ offset: -2, slot: 'c' }], time: 0 }], SLOTS)!;

    // sortKeys per slot: c draws first, then a, then b.
    expect(timeline.orderings).toEqual([1, 2, 0]);
  });

  it('carries one whole ordering per keyframe', () => {
    const timeline = parseSpineDrawOrderTimeline(
      [
        { offsets: [], time: 0 },
        { offsets: [{ offset: 2, slot: 'a' }], time: 1 },
      ],
      SLOTS,
    )!;

    expect(timeline.times).toEqual([0, 1]);
    expect(timeline.orderings).toEqual([0, 1, 2, 2, 0, 1]);
  });

  it('skips and crumbs a keyframe whose moves do not describe a permutation', () => {
    // A destination outside the slot range would silently reorder everything else.
    const diagnostics: ImportDiagnostic[] = [];
    const timeline = parseSpineDrawOrderTimeline(
      [{ offsets: [{ offset: 9, slot: 'a' }], time: 0 }],
      SLOTS,
      diagnostics,
    );

    expect(timeline).toBeNull();
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['spine.draworder-keyframe-unresolved']);
    // Drop, not Skip: the feature is supported and the DATA failed, so this is lost data rather than a
    // capability gap. Pinned because a Skip here would exempt itself from every severity-based check.
    expect(diagnostics[0].severity).toBe(ImportDiagnosticSeverity.Drop);
  });

  it('skips a keyframe where two slots claim one position', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const raw = [
      {
        offsets: [
          { offset: 1, slot: 'a' },
          { offset: 0, slot: 'b' },
        ],
        time: 0,
      },
    ];

    expect(parseSpineDrawOrderTimeline(raw, SLOTS, diagnostics)).toBeNull();
    expect(diagnostics).toHaveLength(1);
  });
});

describe('parseSpineSkeleton', () => {
  it('keeps BOTH axes when a bone carries the per-axis translatex and translatey timelines', () => {
    // Spine 4 writes these lowercased with their own keyframe times. Merged onto the paired path they
    // would overwrite each other back to setup, which is the defect the per-axis paths fixed.
    const result = parseSpineSkeleton(
      JSON.stringify({
        bones: [{ name: 'root' }],
        animations: {
          walk: {
            bones: {
              root: {
                translatex: [
                  { time: 0, value: 0 },
                  { time: 1, value: 7 },
                ],
                translatey: [
                  { time: 0, value: 0 },
                  { time: 1, value: 5 },
                ],
              },
            },
          },
        },
      }),
    )!;
    const setup = result.skeleton;
    const pose = cloneSkeleton2D(setup);

    applyAnimationClipToSkeleton2D(result.animations[0].clip, setup, pose, 1);

    expect(pose.bones[0].x).toBeCloseTo(7, 4);
    expect(pose.bones[0].y).toBeCloseTo(5, 4);
  });

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

  it('Skip-crumbs an unmodeled attachment type, but now PARSES the alternate skin', () => {
    const doc = {
      bones: [{ name: 'root' }],
      slots: [{ name: 'clip', bone: 'root', attachment: 'mask' }],
      skins: [
        { name: 'default', attachments: { clip: { mask: { type: 'clipping', end: 'clip' } } } },
        { name: 'costume2', attachments: {} },
      ],
    };
    const crumbs = collectImportDiagnostics((sink) => parseSpineSkeleton(JSON.stringify(doc), sink));
    expect(crumbs.map((c) => c.kind)).toContain('spine.clipping-attachment-unsupported');
    // The alternate skin is a first-class wardrobe entry now, not a Skip crumb.
    expect(crumbs.map((c) => c.kind)).not.toContain('spine.alternate-skin-unsupported');
    const result = parseSpineSkeleton(JSON.stringify(doc))!;
    expect(result.skeleton.skins!.map((s) => s.name)).toEqual(['default', 'costume2']);
    // The clipping attachment is still dropped (not shown on the slot).
    expect(result.skeleton.slots![0].attachment).toBeNull();
  });

  it('parses every named skin into the wardrobe, resolving slot names to indices', () => {
    const doc = {
      bones: [{ name: 'root' }],
      slots: [
        { name: 'head', bone: 'root', attachment: 'face' },
        { name: 'hand', bone: 'root' },
      ],
      skins: [
        { name: 'default', attachments: { head: { face: { width: 10, height: 10 } } } },
        { name: 'goblin', attachments: { head: { face: { width: 20, height: 20 } }, hand: { axe: { width: 5 } } } },
      ],
    };
    const skeleton = parseSpineSkeleton(JSON.stringify(doc))!.skeleton;
    expect(skeleton.skins!.length).toBe(2);
    const goblin = getSkeleton2DSkin(skeleton, 'goblin')!;
    expect(goblin.attachments.map((a) => [a.slotIndex, a.name])).toEqual([
      [0, 'face'],
      [1, 'axe'],
    ]);
    // The setup pose comes from the DEFAULT skin, keyed by the slot's own attachment name.
    expect((skeleton.slots![0].attachment as RegionAttachment2D).width).toBe(10);
    expect(skeleton.slots![1].attachment).toBeNull();
  });

  it('wears an alternate skin over the setup pose through setSkeleton2DSkin', () => {
    const doc = {
      bones: [{ name: 'root' }],
      slots: [
        { name: 'head', bone: 'root', attachment: 'face' },
        { name: 'body', bone: 'root', attachment: 'torso' },
      ],
      skins: [
        { name: 'default', attachments: { head: { face: { width: 10 } }, body: { torso: { width: 99 } } } },
        { name: 'goblin', attachments: { head: { face: { width: 20 } } } },
      ],
    };
    const skeleton = parseSpineSkeleton(JSON.stringify(doc))!.skeleton;
    setSkeleton2DSkin(skeleton, getSkeleton2DSkin(skeleton, 'goblin')!);
    expect((skeleton.slots![0].attachment as RegionAttachment2D).width).toBe(20); // overridden
    expect((skeleton.slots![1].attachment as RegionAttachment2D).width).toBe(99); // shared art survives
  });

  it('drops a skin entry naming a slot the skeleton does not have', () => {
    const doc = {
      bones: [{ name: 'root' }],
      slots: [{ name: 'head', bone: 'root' }],
      skins: [{ name: 'default', attachments: { ghost: { thing: { width: 1 } } } }],
    };
    const skeleton = parseSpineSkeleton(JSON.stringify(doc))!.skeleton;
    expect(skeleton.skins![0].attachments).toEqual([]);
  });

  it('accepts the older object-form skins map', () => {
    const doc = {
      bones: [{ name: 'root' }],
      slots: [{ name: 'head', bone: 'root', attachment: 'face' }],
      skins: { default: { head: { face: { width: 7 } } }, alt: { head: { face: { width: 8 } } } },
    };
    const skeleton = parseSpineSkeleton(JSON.stringify(doc))!.skeleton;
    expect(skeleton.skins!.map((s) => s.name).sort()).toEqual(['alt', 'default']);
    expect((skeleton.slots![0].attachment as RegionAttachment2D).width).toBe(7);
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

  it('Skip-crumbs a genuinely divergent per-component curve, and the DOMINANT component wins', () => {
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
    // y moves 0..20 and x only 0..10, so Y's curve supplies the easing for both components.
    const alpha = easeCubicBezier(0.1, 0, 0.9, 1)(0.5);
    expect(pose.bones[0].x).toBeCloseTo(10 * alpha, 4);
    expect(pose.bones[0].y).toBeCloseTo(20 * alpha, 4);
  });

  it('ignores a NEAR-CONSTANT component when choosing the curve, however tiny its motion', () => {
    // The rebase divides by a component's value change, so a barely-moving component is a near-zero
    // denominator: its control points normalize to wild values and the resulting curve is not the authored
    // shape at all. Here x moves 0.004 while y moves a full 20 — y must win, and the tiny x curve (whose
    // control points would rebase far outside the unit square) must not be allowed to supply the easing.
    const doc = curveDoc(
      [
        { time: 0, x: 0.847, y: 0, curve: [0.174, 0.85, 0.184, 0.84, 0.174, 0, 0.184, 15.8] },
        { time: 1, x: 0.843, y: 20 },
      ],
      'translate',
    );
    const result = parseSpineSkeleton(JSON.stringify(doc))!;
    const pose = cloneSkeleton2D(result.skeleton);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, result.skeleton, pose, 0.5);
    const alpha = easeCubicBezier(0.174, 0, 0.184, 0.79)(0.5);
    expect(pose.bones[0].y).toBeCloseTo(20 * alpha, 3);
    // Sanity: the eased value stays inside the segment. Riding x's curve produced values outside it.
    expect(pose.bones[0].y).toBeGreaterThanOrEqual(0);
    expect(pose.bones[0].y).toBeLessThanOrEqual(20);
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
    // Clamping the overshoot leaves a segment whose alpha is linear, so the midpoint of a 0..90 rotation
    // is exactly 45. Asserting merely "greater than zero" would have passed for any positive garbage.
    expect(pose.bones[0].rotation).toBeCloseTo(45, 4);
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

  it('builds an ABSOLUTE slot colour channel that the binder writes rather than composes', () => {
    const doc = {
      bones: [{ name: 'b' }],
      slots: [{ name: 's', bone: 'b', color: '112233ff' }],
      animations: {
        a: {
          slots: {
            s: {
              rgba: [
                { time: 0, color: 'ff000080' },
                { time: 1, color: '0000ffff' },
              ],
            },
          },
        },
      },
    };
    const result = parseSpineSkeleton(JSON.stringify(doc))!;
    const setup = result.skeleton;
    const pose = cloneSkeleton2D(setup);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, setup, pose, 0);
    expect(pose.slots![0].color).toBe(0xff000080);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, setup, pose, 1);
    expect(pose.slots![0].color).toBe(0x0000ffff);
    // The setup colour is never blended in — a slot colour is authored absolutely.
    expect(setup.slots![0].color).toBe(0x112233ff);
  });

  it('interpolates a slot colour across the segment', () => {
    const doc = {
      bones: [{ name: 'b' }],
      slots: [{ name: 's', bone: 'b' }],
      animations: {
        a: {
          slots: {
            s: {
              rgba: [
                { time: 0, color: '00000000' },
                { time: 1, color: 'ffffffff' },
              ],
            },
          },
        },
      },
    };
    const result = parseSpineSkeleton(JSON.stringify(doc))!;
    const pose = cloneSkeleton2D(result.skeleton);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, result.skeleton, pose, 0.5);
    expect(pose.slots![0].color).toBe(0x80808080);
  });

  it('Skip-crumbs the slot timeline kinds Slot2D cannot represent', () => {
    const doc = {
      bones: [{ name: 'b' }],
      slots: [{ name: 's', bone: 'b' }],
      animations: { a: { slots: { s: { rgb: [], alpha: [], attachment: [], rgba2: [] } } } },
    };
    const kinds = collectImportDiagnostics((sink) => parseSpineSkeleton(JSON.stringify(doc), sink)).map((c) => c.kind);
    expect(kinds).toContain('spine.slot-rgb-timeline-unsupported');
    expect(kinds).toContain('spine.slot-alpha-timeline-unsupported');
    expect(kinds).toContain('spine.slot-rgba2-timeline-unsupported');
  });

  it('builds a STEP attachment-swap channel of indices into a per-channel table', () => {
    const doc = {
      bones: [{ name: 'b' }],
      slots: [{ name: 's', bone: 'b', attachment: 'one' }],
      skins: [{ name: 'default', attachments: { s: { one: { width: 1 }, two: { width: 2 } } } }],
      animations: {
        a: {
          slots: {
            s: {
              attachment: [{ time: 0, name: 'one' }, { time: 1, name: 'two' }, { time: 2 }],
            },
          },
        },
      },
    };
    const result = parseSpineSkeleton(JSON.stringify(doc))!;
    const pose = cloneSkeleton2D(result.skeleton);
    const clip = result.animations[0].clip;
    applyAnimationClipToSkeleton2D(clip, result.skeleton, pose, 0);
    expect((pose.slots![0].attachment as RegionAttachment2D).width).toBe(1);
    applyAnimationClipToSkeleton2D(clip, result.skeleton, pose, 1);
    expect((pose.slots![0].attachment as RegionAttachment2D).width).toBe(2);
    // A nameless keyframe is Spine's "hide this slot".
    applyAnimationClipToSkeleton2D(clip, result.skeleton, pose, 2);
    expect(pose.slots![0].attachment).toBeNull();
  });

  it('HOLDS each attachment until the next keyframe rather than interpolating', () => {
    const doc = {
      bones: [{ name: 'b' }],
      slots: [{ name: 's', bone: 'b' }],
      skins: [{ name: 'default', attachments: { s: { one: { width: 1 }, two: { width: 2 } } } }],
      animations: {
        a: {
          slots: {
            s: {
              attachment: [
                { time: 0, name: 'one' },
                { time: 1, name: 'two' },
              ],
            },
          },
        },
      },
    };
    const result = parseSpineSkeleton(JSON.stringify(doc))!;
    const pose = cloneSkeleton2D(result.skeleton);
    // Mid-segment must still show the FIRST attachment — there is no halfway art.
    applyAnimationClipToSkeleton2D(result.animations[0].clip, result.skeleton, pose, 0.99);
    expect((pose.slots![0].attachment as RegionAttachment2D).width).toBe(1);
  });

  it('FORCES step semantics even if the track claims Linear', () => {
    // The binder must not trust the track here: interpolating between table INDICES would resolve to art
    // that no keyframe ever named. Rebuild the channel as Linear and confirm it still steps.
    const doc = {
      bones: [{ name: 'b' }],
      slots: [{ name: 's', bone: 'b' }],
      skins: [{ name: 'default', attachments: { s: { one: { width: 1 }, two: { width: 2 } } } }],
      animations: {
        a: {
          slots: {
            s: {
              attachment: [
                { time: 0, name: 'one' },
                { time: 1, name: 'two' },
              ],
            },
          },
        },
      },
    };
    const result = parseSpineSkeleton(JSON.stringify(doc))!;
    const channel = result.animations[0].clip.channels[0];
    const linear = createAnimationChannel(
      createAnimationTrack({
        components: 1,
        interpolation: AnimationInterpolationLinear,
        times: channel.track.times,
        values: channel.track.values,
      }),
      channel.targetRef,
    );
    const pose = cloneSkeleton2D(result.skeleton);
    applyAnimationClipToSkeleton2D(createAnimationClip([linear]), result.skeleton, pose, 0.5);
    expect((pose.slots![0].attachment as RegionAttachment2D).width).toBe(1); // not a blended index
  });

  it('DEDUPLICATES the attachment table when a swap cycles back', () => {
    const doc = {
      bones: [{ name: 'b' }],
      slots: [{ name: 's', bone: 'b' }],
      skins: [{ name: 'default', attachments: { s: { one: { width: 1 }, two: { width: 2 } } } }],
      animations: {
        a: {
          slots: {
            s: {
              attachment: [
                { time: 0, name: 'one' },
                { time: 1, name: 'two' },
                { time: 2, name: 'one' },
              ],
            },
          },
        },
      },
    };
    const target = parseSpineSkeleton(JSON.stringify(doc))!.animations[0].clip.channels[0].targetRef as {
      attachments: unknown[];
    };
    expect(target.attachments.length).toBe(2); // 'one' is stored once, not twice
  });

  it('keeps timing when a keyframe names art the setup skin does not supply', () => {
    // Dropping the keyframe would shift every later swap earlier; it becomes a hide instead.
    const doc = {
      bones: [{ name: 'b' }],
      slots: [{ name: 's', bone: 'b' }],
      skins: [{ name: 'default', attachments: { s: { one: { width: 1 } } } }],
      animations: {
        a: {
          slots: {
            s: {
              attachment: [
                { time: 0, name: 'ghost' },
                { time: 1, name: 'one' },
              ],
            },
          },
        },
      },
    };
    const result = parseSpineSkeleton(JSON.stringify(doc))!;
    const pose = cloneSkeleton2D(result.skeleton);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, result.skeleton, pose, 0);
    expect(pose.slots![0].attachment).toBeNull();
    applyAnimationClipToSkeleton2D(result.animations[0].clip, result.skeleton, pose, 1);
    expect((pose.slots![0].attachment as RegionAttachment2D).width).toBe(1);
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
  });
});

// A one-bone document whose single animation carries `keys` as bone `b`'s timeline of the given kind.
function curveDoc(keys: readonly Record<string, unknown>[], kind = 'rotate'): Record<string, unknown> {
  return { bones: [{ name: 'b' }], animations: { a: { bones: { b: { [kind]: keys } } } } };
}

// ONE test for a family of ~23 guards, not one test each. The idea behind them is a single policy — THE
// IMPORTER NEVER TRUSTS A FIELD'S TYPE — and a document is untrusted input arriving over a network or out
// of a user's project folder, so every field of it can be anything. Writing a case per guard would pin the
// same policy twenty-three times and still miss the field nobody thought of; walking the document reaches
// the ones nobody thought of by construction.
//
// The assertion is deliberately weak on CONTENT and strict on SURVIVAL. A wrongly-typed field has no
// correct interpretation, so there is nothing to assert about what comes back — only that something did,
// and that what came back is internally coherent rather than half-built.
describe('parseSpineSkeleton type resilience', () => {
  it('never trusts a field type: any value replaced by a wrong-typed one still imports coherently', () => {
    const paths = everyJsonPath(SPINE_RICH);
    expect(paths.length, 'the rich document walked no paths').toBeGreaterThan(40);

    for (const path of paths) {
      for (const wrong of [42, 'wrong', [], {}, null, true]) {
        const label = `${path.join('.')} = ${JSON.stringify(wrong)}`;
        const json = JSON.stringify(withValueAt(SPINE_RICH, path, wrong));
        let result: ReturnType<typeof parseSpineSkeleton> | undefined;
        expect(() => {
          result = parseSpineSkeleton(json);
        }, label).not.toThrow();

        const bones = result?.skeleton.bones;
        if (bones === undefined) continue;
        for (const bone of bones) {
          expect(bone.parentIndex, `parentIndex after ${label}`).toBeLessThan(bones.length);
          expect(bone.parentIndex, `parentIndex after ${label}`).toBeGreaterThanOrEqual(-1);
        }
      }
    }
  });
});

function slot(name: string): Slot2D {
  return { attachment: null, boneIndex: 0, color: 0xffffffff, name };
}
