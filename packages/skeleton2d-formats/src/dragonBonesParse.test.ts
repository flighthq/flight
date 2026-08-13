import { easeCubicBezier } from '@flighthq/easing/contract';
import { collectImportDiagnostics } from '@flighthq/importdiagnostics/contract';
import {
  applyAnimationClipToSkeleton2D,
  cloneSkeleton2D,
  getSkeleton2DSkin,
  setSkeleton2DSkin,
} from '@flighthq/skeleton2d/contract';
import type {
  AnimationChannel,
  ImportDiagnostic,
  MeshAttachment2D,
  RegionAttachment2D,
  Skeleton2DAnimationTarget,
} from '@flighthq/types/contract';
import {
  ImportDiagnosticSeverity,
  MeshAttachment2DKind,
  RegionAttachment2DKind,
  Skeleton2DAnimationPath,
  TransformMode2D,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { parseDragonBonesSkeleton } from './dragonBonesParse';

// Hand-authored minimal DragonBones JSON (per the real-asset rule: committed fixtures are hand-written,
// never transcribed from a rig). Bones are listed CHILD-FIRST to exercise the topological sort.
const DB_TWO_BONES = JSON.stringify({
  frameRate: 24,
  name: 'demo',
  version: '5.5',
  armature: [
    {
      name: 'armatureA',
      bone: [
        { name: 'arm', parent: 'root', length: 50, transform: { x: 10, y: 20, skX: 45, skY: 30, scX: 2, scY: 3 } },
        { name: 'root' },
      ],
    },
  ],
});

// The sibling of the Spine type sweep, and NOT a ritual copy of it: this is a different importer with its
// own guards, its own nesting (everything hangs off `armature`), and 37 of the package's type-guard arms
// against Spine's 23. Same single policy — THE IMPORTER NEVER TRUSTS A FIELD'S TYPE — pointed at the
// document shape DragonBones actually uses.
const DB_RICH = {
  armature: [
    {
      animation: [
        {
          bone: [{ frame: [{ duration: 5, tweenEasing: 0 }], name: 'arm' }],
          duration: 10,
          ffd: [{ name: 'mesh', slot: 'body' }],
          frame: [{ duration: 10 }],
          name: 'walk',
          slot: [{ displayFrame: [{ value: 0 }], name: 'body' }],
        },
      ],
      bone: [{ name: 'root' }, { length: 50, name: 'arm', parent: 'root', transform: { skX: 45, x: 10, y: 20 } }],
      defaultActions: [{ gotoAndPlay: 'walk' }],
      ik: [{ bone: 'arm', name: 'aim', target: 'root' }],
      name: 'armatureA',
      skin: [{ name: '', slot: [{ display: [{ name: 'mesh', type: 'mesh', vertices: [0, 0, 1, 1] }], name: 'body' }] }],
      slot: [{ blendMode: 'normal', color: { aM: 100 }, displayIndex: 0, name: 'body', parent: 'root' }],
    },
  ],
  frameRate: 24,
  name: 'demo',
  version: '5.5',
};

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

describe('parseDragonBonesSkeleton', () => {
  it('parses the first armature, topologically sorts bones, and maps the skX/skY transform', () => {
    const result = parseDragonBonesSkeleton(DB_TWO_BONES);
    expect(result).not.toBeNull();
    const bones = result!.skeleton.bones;
    expect(bones.length).toBe(2);
    // Topological sort puts the parent (listed second) before its child.
    expect(bones[0].name).toBe('root');
    expect(bones[0].parentIndex).toBe(-1);
    const arm = bones[1];
    expect(arm.name).toBe('arm');
    expect(arm.parentIndex).toBe(0); // 'root' resolved to index 0
    expect(arm.length).toBe(50);
    expect(arm.x).toBe(10);
    expect(arm.y).toBe(20);
    // rotation = skY = 30, shearX = 0, shearY = skX − skY = 15; scale from scX/scY.
    expect(arm.rotation).toBe(30);
    expect(arm.shearX).toBe(0);
    expect(arm.shearY).toBe(15);
    expect(arm.scaleX).toBe(2);
    expect(arm.scaleY).toBe(3);
    expect(result!.animations).toEqual([]);
  });

  it('maps the newer rotate/skew transform form identically to skX/skY', () => {
    const doc = { armature: [{ bone: [{ name: 'b', transform: { rotate: 30, skew: 15 } }] }] };
    const bone = parseDragonBonesSkeleton(JSON.stringify(doc))!.skeleton.bones[0];
    expect(bone.rotation).toBe(30);
    expect(bone.shearY).toBe(15);
  });

  it('applies DragonBones defaults for an omitted transform', () => {
    const doc = { armature: [{ bone: [{ name: 'b' }] }] };
    const bone = parseDragonBonesSkeleton(JSON.stringify(doc))!.skeleton.bones[0];
    expect(bone).toMatchObject({
      x: 0,
      y: 0,
      rotation: 0,
      shearX: 0,
      shearY: 0,
      scaleX: 1,
      scaleY: 1,
      length: 0,
      parentIndex: -1,
      transformMode: TransformMode2D.Normal,
    });
  });

  it('maps the DragonBones inheritance booleans onto TransformMode2D', () => {
    const doc = {
      armature: [
        {
          bone: [
            { name: 'normal' },
            { name: 'onlyT', inheritRotation: false, inheritScale: false, inheritReflection: false },
            { name: 'noScale', inheritScale: false },
            { name: 'noScaleRefl', inheritScale: false, inheritReflection: false },
            { name: 'noRot', inheritRotation: false, inheritReflection: false },
          ],
        },
      ],
    };
    const bones = parseDragonBonesSkeleton(JSON.stringify(doc))!.skeleton.bones;
    const mode = (name: string) => bones.find((b) => b.name === name)!.transformMode;
    // Booleans map straight to TransformInherit2D; the five well-known combos equal their named presets.
    expect(mode('normal')).toEqual(TransformMode2D.Normal);
    expect(mode('onlyT')).toEqual(TransformMode2D.OnlyTranslation);
    expect(mode('noScale')).toEqual(TransformMode2D.NoScale);
    expect(mode('noScaleRefl')).toEqual(TransformMode2D.NoScaleOrReflection);
    expect(mode('noRot')).toEqual(TransformMode2D.NoRotationOrReflection);
  });

  it('expresses an inherit combo the old five-value enum could not, with no Skip crumb', () => {
    // "strip rotation, keep scale AND reflection" had no TransformMode2D preset; the factored boolean model
    // holds it directly. It maps cleanly and emits no diagnostic.
    const doc = { armature: [{ bone: [{ name: 'b', inheritRotation: false }] }] };
    const crumbs: ImportDiagnostic[] = collectImportDiagnostics((sink) =>
      parseDragonBonesSkeleton(JSON.stringify(doc), sink),
    );
    expect(crumbs).toEqual([]);
    expect(parseDragonBonesSkeleton(JSON.stringify(doc))!.skeleton.bones[0].transformMode).toEqual({
      reflection: true,
      rotation: false,
      scale: true,
      translation: true,
    });
  });

  it('parses slots with resolved bone index, image display, and ColorTransform tint', () => {
    const doc = {
      armature: [
        {
          bone: [{ name: 'root' }, { name: 'armBone', parent: 'root' }],
          slot: [{ name: 'arm', parent: 'armBone', displayIndex: 0, color: { rM: 50, gM: 75, bM: 100, aM: 100 } }],
          skin: [
            {
              name: 'default',
              slot: [{ name: 'arm', display: [{ name: 'armImage', transform: { x: 1, y: 2, skX: 30, skY: 30 } }] }],
            },
          ],
        },
      ],
    };
    const slots = parseDragonBonesSkeleton(JSON.stringify(doc))!.skeleton.slots!;
    expect(slots.length).toBe(1);
    expect(slots[0].name).toBe('arm');
    expect(slots[0].boneIndex).toBe(1); // 'armBone' resolved to its topo-sorted output index
    // ColorTransform multiply 50/75/100/100 % → RR GG BB AA bytes 0x80 0xbf 0xff 0xff.
    expect(slots[0].color).toBe(0x80bfffff);
    const region = slots[0].attachment as RegionAttachment2D;
    expect(region.kind).toBe(RegionAttachment2DKind);
    expect(region).toMatchObject({ x: 1, y: 2, rotation: 30, scaleX: 1, scaleY: 1 });
  });

  it('parses an unweighted mesh display into a MeshAttachment2D (positions direct, skin null)', () => {
    const doc = {
      armature: [
        {
          bone: [{ name: 'root' }],
          slot: [{ name: 's', parent: 'root' }],
          skin: [
            {
              name: 'default',
              slot: [
                {
                  name: 's',
                  display: [
                    {
                      type: 'mesh',
                      name: 'm',
                      uvs: [0, 0, 1, 0, 1, 1],
                      triangles: [0, 1, 2],
                      vertices: [0, 0, 10, 0, 10, 10],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const mesh = parseDragonBonesSkeleton(JSON.stringify(doc))!.skeleton.slots![0].attachment as MeshAttachment2D;
    expect(mesh.kind).toBe(MeshAttachment2DKind);
    expect(mesh.skin).toBeNull();
    expect(mesh.vertexCount).toBe(3);
    expect(Array.from(mesh.vertices!)).toEqual([0, 0, 10, 0, 10, 10]);
    expect(Array.from(mesh.triangles)).toEqual([0, 1, 2]);
  });

  // Wraps a single weighted mesh display in a full DragonBones doc. Bones are listed CHILD-FIRST so the
  // topo-sort reorders (output [root=0, child=1]); the weights reference bones by armature FILE-ORDER index.
  function weightedMeshDoc(mesh: Record<string, unknown>): string {
    return JSON.stringify({
      armature: [
        {
          bone: [{ name: 'child', parent: 'root' }, { name: 'root' }],
          slot: [{ name: 's', parent: 'root' }],
          skin: [{ name: 'default', slot: [{ name: 's', display: [{ type: 'mesh', name: 'm', ...mesh }] }] }],
        },
      ],
    });
  }

  it('converts a WEIGHTED mesh to Skin2D offsets, remapping bone indices through the topo-sort (formula parity)', () => {
    // slotPose identity; the used bone is armature raw index 0 ('child'), which the topo-sort places at
    // OUTPUT index 1. Its bind matrix is translate(10,0), so the inverse maps vertex (12,5) → bind-local (2,5).
    const mesh = parseDragonBonesSkeleton(
      weightedMeshDoc({
        uvs: [0, 0],
        triangles: [],
        vertices: [12, 5],
        slotPose: [1, 0, 0, 1, 0, 0],
        bonePose: [0, 1, 0, 0, 1, 10, 0], // rawBoneIndex 0, bind = translate(10,0)
        weights: [1, 0, 1], // vertex 0: one influence, rawBoneIndex 0, weight 1
      }),
    )!.skeleton.slots![0].attachment as MeshAttachment2D;
    expect(mesh.vertices).toBeNull();
    expect(Array.from(mesh.skin!.influenceCounts)).toEqual([1]);
    // [outputBoneIndex, offsetX, offsetY, weight]: raw bone 0 ('child') → OUTPUT 1; offset (2,5).
    expect(Array.from(mesh.skin!.influences)).toEqual([1, 2, 5, 1]);
  });

  it('applies the inverse bind ROTATION when converting a weighted mesh (formula parity)', () => {
    // Bind matrix = a 90° rotation ([a,b,c,d]=[0,1,-1,0]); its inverse rotates the vertex (1,0) to (0,-1).
    const mesh = parseDragonBonesSkeleton(
      weightedMeshDoc({
        uvs: [0, 0],
        triangles: [],
        vertices: [1, 0],
        slotPose: [1, 0, 0, 1, 0, 0],
        bonePose: [1, 0, 1, -1, 0, 0, 0], // rawBoneIndex 1 ('root' → output 0), bind = 90° rotation
        weights: [1, 1, 1], // vertex 0: one influence, rawBoneIndex 1, weight 1
      }),
    )!.skeleton.slots![0].attachment as MeshAttachment2D;
    const influences = Array.from(mesh.skin!.influences);
    expect(influences[0]).toBe(0); // raw bone 1 ('root') → OUTPUT 0
    expect(influences[1]).toBeCloseTo(0, 5); // offsetX
    expect(influences[2]).toBeCloseTo(-1, 5); // offsetY
    expect(influences[3]).toBe(1); // weight
  });

  it('recovers (Recover crumb) a weighted mesh whose stream is truncated, without reading past the end', () => {
    const kinds = collectImportDiagnostics((sink) =>
      parseDragonBonesSkeleton(
        weightedMeshDoc({
          uvs: [0, 0],
          triangles: [],
          vertices: [0, 0],
          slotPose: [1, 0, 0, 1, 0, 0],
          bonePose: [1, 1, 0, 0, 1, 0, 0],
          weights: [2, 1, 1], // declares 2 influences but only supplies one before the stream ends
        }),
        sink,
      ),
    ).map((c) => c.kind);
    expect(kinds).toContain('dragonbones.weighted-mesh-recovered');
  });

  it('recover-drops an influence whose bone index does not resolve, never emitting a -1 index (BLOCK 1)', () => {
    // bonePose references raw bone 99, out of range for the 2-bone armature → the remap returns -1. A -1
    // would index deformSkeleton2DMeshAttachment's world buffer from byte -6 and produce NaNs; it is dropped.
    const crumbs: ImportDiagnostic[] = collectImportDiagnostics((sink) =>
      parseDragonBonesSkeleton(
        weightedMeshDoc({
          uvs: [0, 0],
          triangles: [],
          vertices: [0, 0],
          slotPose: [1, 0, 0, 1, 0, 0],
          bonePose: [99, 1, 0, 0, 1, 0, 0], // used bone's raw index 99 has no output bone
          weights: [1, 99, 1],
        }),
        sink,
      ),
    );
    const mesh = parseDragonBonesSkeleton(
      weightedMeshDoc({
        uvs: [0, 0],
        triangles: [],
        vertices: [0, 0],
        slotPose: [1, 0, 0, 1, 0, 0],
        bonePose: [99, 1, 0, 0, 1, 0, 0],
        weights: [1, 99, 1],
      }),
    )!.skeleton.slots![0].attachment as MeshAttachment2D;
    expect(Array.from(mesh.skin!.influenceCounts)).toEqual([0]); // the unresolved influence was dropped
    expect(Array.from(mesh.skin!.influences)).toEqual([]); // no -1 index emitted
    expect(crumbs.map((c) => c.kind)).toContain('dragonbones.weighted-mesh-recovered');
  });

  it('remaps weighted bone indices positionally, so duplicate bone names do not collide (BLOCK 2)', () => {
    // Two surviving bones share the name "dup". Resolving the weights remap by name alone would send both
    // influences to the last "dup" (output 1); the positional remap keeps raw 0 → output 0, raw 1 → output 1.
    const doc = {
      armature: [
        {
          bone: [{ name: 'dup' }, { name: 'dup' }],
          slot: [{ name: 's', parent: 'dup' }],
          skin: [
            {
              name: 'default',
              slot: [
                {
                  name: 's',
                  display: [
                    {
                      type: 'mesh',
                      name: 'm',
                      uvs: [0, 0, 0, 0],
                      triangles: [],
                      vertices: [0, 0, 0, 0],
                      slotPose: [1, 0, 0, 1, 0, 0],
                      bonePose: [0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0], // used bones raw 0 and raw 1
                      weights: [1, 0, 1, 1, 1, 1], // vertex 0 → raw bone 0; vertex 1 → raw bone 1
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const skin = (parseDragonBonesSkeleton(JSON.stringify(doc))!.skeleton.slots![0].attachment as MeshAttachment2D)
      .skin!;
    // influences are [boneIndex, x, y, weight] per influence; vertex 0's bone then vertex 1's bone.
    expect(skin.influences[0]).toBe(0); // raw bone 0 → OUTPUT 0
    expect(skin.influences[4]).toBe(1); // raw bone 1 → OUTPUT 1, not collided onto 0
  });

  it('caps a vertex influence count at the representable maximum instead of wrapping Uint16 (BLOCK 3)', () => {
    // A vertex declaring 65536 influences would wrap influenceCounts[0] to 0, breaking the deformer's
    // invariant influences.length === 4 × Σ influenceCounts. The count is capped while the stream is consumed.
    const pairs: number[] = [65536];
    for (let k = 0; k < 65536; k++) pairs.push(0, 0); // 65536 influences on raw bone 0, weight 0
    const mesh = parseDragonBonesSkeleton(
      weightedMeshDoc({
        uvs: [0, 0],
        triangles: [],
        vertices: [0, 0],
        slotPose: [1, 0, 0, 1, 0, 0],
        bonePose: [0, 1, 0, 0, 1, 0, 0],
        weights: pairs,
      }),
    )!.skeleton.slots![0].attachment as MeshAttachment2D;
    const total = Array.from(mesh.skin!.influenceCounts).reduce((a, c) => a + c, 0);
    expect(total).toBe(0xffff); // capped, not wrapped to 0
    expect(mesh.skin!.influences.length).toBe(total * 4); // deformer invariant holds
  });

  it('holds an unmodeled display at its displayIndex slot (null, not dropped) so indices stay aligned', () => {
    // A boundingBox display at index 0 must NOT drop, or the image at index 1 would shift to 0 and
    // displayIndex 1 would then address the wrong display (read-integrity axis 12 on the display array).
    const doc = {
      armature: [
        {
          bone: [{ name: 'root' }],
          slot: [{ name: 's', parent: 'root', displayIndex: 1 }],
          skin: [
            {
              name: 'default',
              slot: [
                {
                  name: 's',
                  display: [
                    { type: 'boundingBox', name: 'bb' },
                    { name: 'img', transform: { x: 9 } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const crumbs: ImportDiagnostic[] = collectImportDiagnostics((sink) =>
      parseDragonBonesSkeleton(JSON.stringify(doc), sink),
    );
    expect(crumbs.map((c) => c.kind)).toContain('dragonbones.boundingBox-display-unsupported');
    // displayIndex 1 still resolves to the image, not shifted down by the dropped mesh.
    const region = parseDragonBonesSkeleton(JSON.stringify(doc))!.skeleton.slots![0].attachment as RegionAttachment2D;
    expect(region.kind).toBe(RegionAttachment2DKind);
    expect(region.x).toBe(9);
  });

  it('Skip-crumbs additional armatures and IK constraints, but now PARSES alternate skins', () => {
    const doc = {
      armature: [
        {
          bone: [{ name: 'root' }],
          slot: [{ name: 's', parent: 'root' }],
          skin: [
            { name: 'default', slot: [] },
            { name: 'costume2', slot: [] },
          ],
          ik: [{ name: 'legIk', bone: 'root', target: 'root' }],
        },
        { bone: [{ name: 'other' }] },
      ],
    };
    const crumbs: ImportDiagnostic[] = collectImportDiagnostics((sink) =>
      parseDragonBonesSkeleton(JSON.stringify(doc), sink),
    );
    const kinds = crumbs.map((c) => c.kind);
    expect(kinds).toContain('dragonbones.multi-armature-unsupported');
    expect(kinds).toContain('dragonbones.ik-constraint-unsupported');
    // The alternate skin is a wardrobe entry now, not a Skip crumb.
    expect(kinds).not.toContain('dragonbones.alternate-skin-unsupported');
    expect(parseDragonBonesSkeleton(JSON.stringify(doc))!.skeleton.skins!.map((s) => s.name)).toEqual([
      'default',
      'costume2',
    ]);
    // Only the first armature is parsed.
    expect(parseDragonBonesSkeleton(JSON.stringify(doc))!.skeleton.bones[0].name).toBe('root');
  });

  it('parses every armature skin into the wardrobe, keyed by display name', () => {
    const doc = {
      armature: [
        {
          bone: [{ name: 'root' }],
          slot: [
            { name: 'head', parent: 'root', displayIndex: 0 },
            { name: 'hand', parent: 'root' },
          ],
          skin: [
            { name: 'default', slot: [{ name: 'head', display: [{ name: 'face' }] }] },
            {
              name: 'costume2',
              slot: [
                { name: 'head', display: [{ name: 'face-alt' }] },
                { name: 'hand', display: [{ name: 'axe' }] },
              ],
            },
          ],
        },
      ],
    };
    const skeleton = parseDragonBonesSkeleton(JSON.stringify(doc))!.skeleton;
    expect(skeleton.skins!.map((s) => s.name)).toEqual(['default', 'costume2']);
    const alt = skeleton.skins![1];
    expect(alt.attachments.map((a) => [a.slotIndex, a.name])).toEqual([
      [0, 'face-alt'],
      [1, 'axe'],
    ]);
    // The setup pose still resolves through displayIndex against the DEFAULT skin's positional list.
    expect((skeleton.slots![0].attachment as RegionAttachment2D).name).toBe('face');
  });

  it('wears an alternate DragonBones skin over the setup pose', () => {
    const doc = {
      armature: [
        {
          bone: [{ name: 'root' }],
          slot: [{ name: 'head', parent: 'root', displayIndex: 0 }],
          skin: [
            { name: 'default', slot: [{ name: 'head', display: [{ name: 'face' }] }] },
            { name: 'costume2', slot: [{ name: 'head', display: [{ name: 'face-alt' }] }] },
          ],
        },
      ],
    };
    const skeleton = parseDragonBonesSkeleton(JSON.stringify(doc))!.skeleton;
    setSkeleton2DSkin(skeleton, getSkeleton2DSkin(skeleton, 'costume2')!);
    expect((skeleton.slots![0].attachment as RegionAttachment2D).name).toBe('face-alt');
  });

  it('animates a slot display swap as a STEP channel indexing the slot display list', () => {
    const doc = {
      frameRate: 10,
      armature: [
        {
          bone: [{ name: 'root' }],
          slot: [{ name: 'head', parent: 'root', displayIndex: 0 }],
          skin: [{ name: 'default', slot: [{ name: 'head', display: [{ name: 'face' }, { name: 'face-alt' }] }] }],
          animation: [
            {
              name: 'blink',
              slot: [
                {
                  name: 'head',
                  displayFrame: [
                    { duration: 5, value: 0 },
                    { duration: 5, value: 1 },
                    { duration: 0, value: -1 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = parseDragonBonesSkeleton(JSON.stringify(doc))!;
    const pose = cloneSkeleton2D(result.skeleton);
    const clip = result.animations[0].clip;
    applyAnimationClipToSkeleton2D(clip, result.skeleton, pose, 0);
    expect((pose.slots![0].attachment as RegionAttachment2D).name).toBe('face');
    applyAnimationClipToSkeleton2D(clip, result.skeleton, pose, 0.5); // 5 frames at 10fps
    expect((pose.slots![0].attachment as RegionAttachment2D).name).toBe('face-alt');
    // A negative display index is DragonBones' "show nothing".
    applyAnimationClipToSkeleton2D(clip, result.skeleton, pose, 1);
    expect(pose.slots![0].attachment).toBeNull();
  });

  it('animates a slot colour, normalizing the 0-100 percent channels rather than bytes', () => {
    const doc = {
      frameRate: 10,
      armature: [
        {
          bone: [{ name: 'root' }],
          slot: [{ name: 'head', parent: 'root' }],
          animation: [
            {
              name: 'fade',
              slot: [
                {
                  name: 'head',
                  colorFrame: [
                    { duration: 10, value: { aM: 100, rM: 100, gM: 100, bM: 100 } },
                    { duration: 0, value: { aM: 0, rM: 100, gM: 0, bM: 0 } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = parseDragonBonesSkeleton(JSON.stringify(doc))!;
    const pose = cloneSkeleton2D(result.skeleton);
    const clip = result.animations[0].clip;
    applyAnimationClipToSkeleton2D(clip, result.skeleton, pose, 0);
    expect(pose.slots![0].color).toBe(0xffffffff);
    applyAnimationClipToSkeleton2D(clip, result.skeleton, pose, 1);
    expect(pose.slots![0].color).toBe(0xff000000); // red kept, everything else faded out
  });

  it('accepts the older display/color frame spellings', () => {
    const doc = {
      frameRate: 10,
      armature: [
        {
          bone: [{ name: 'root' }],
          slot: [{ name: 'head', parent: 'root' }],
          skin: [{ name: 'default', slot: [{ name: 'head', display: [{ name: 'a' }, { name: 'b' }] }] }],
          animation: [
            {
              name: 'old',
              slot: [{ name: 'head', display: [{ duration: 5, displayIndex: 1 }] }],
            },
          ],
        },
      ],
    };
    const result = parseDragonBonesSkeleton(JSON.stringify(doc))!;
    const pose = cloneSkeleton2D(result.skeleton);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, result.skeleton, pose, 0);
    expect((pose.slots![0].attachment as RegionAttachment2D).name).toBe('b');
  });

  it('Skip-crumbs a slot timeline naming a slot the armature does not have', () => {
    const doc = {
      armature: [
        {
          bone: [{ name: 'root' }],
          slot: [{ name: 'head', parent: 'root' }],
          animation: [{ name: 'a', slot: [{ name: 'ghost', displayFrame: [{ duration: 1, value: 0 }] }] }],
        },
      ],
    };
    const kinds = collectImportDiagnostics((sink) => parseDragonBonesSkeleton(JSON.stringify(doc), sink)).map(
      (c) => c.kind,
    );
    expect(kinds).toContain('dragonbones.slot-timeline-unsupported');
  });

  it('Skip-crumbs a 5.6 BLEND TREE animation instead of emitting a silently empty clip', () => {
    const doc = {
      armature: [
        {
          bone: [{ name: 'root' }],
          animation: [
            { name: 'keyframed', bone: [{ name: 'root', rotateFrame: [{ duration: 1, rotate: 10 }] }] },
            { name: 'blended', type: 'tree', duration: 0, timeline: [{ x: 0 }] },
          ],
        },
      ],
    };
    const crumbs = collectImportDiagnostics((sink) => parseDragonBonesSkeleton(JSON.stringify(doc), sink)).filter(
      (c) => c.kind === 'dragonbones.blend-tree-animation-unsupported',
    );
    expect(crumbs.length).toBe(1);
    expect(crumbs[0].detail).toMatchObject({ animations: 1 });
    // The name is still emitted so the rig's animation list stays complete; only the emptiness is reported.
    const result = parseDragonBonesSkeleton(JSON.stringify(doc))!;
    expect(result.animations.map((a) => a.name)).toEqual(['keyframed', 'blended']);
    expect(result.animations[1].clip.channels.length).toBe(0);
    // The keyframed animation keeps its one channel. Asserting only "more than zero" here, opposite an
    // exact 0 on the line above, would have passed if channels were silently dropped.
    expect(result.animations[0].clip.channels.length).toBe(1);
  });

  it('HONORS a bezier curve frame, whose control points are already normalized', () => {
    // DragonBones writes 4 values in the unit square — unlike Spine's absolute per-component form — so the
    // curve maps straight onto easeCubicBezier with no rebasing.
    const doc = {
      frameRate: 10,
      armature: [
        {
          bone: [{ name: 'b' }],
          animation: [
            {
              name: 'a',
              bone: [
                {
                  name: 'b',
                  rotateFrame: [
                    { duration: 10, rotate: 0, curve: [0.42, 0, 1, 1] },
                    { duration: 0, rotate: 90 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = parseDragonBonesSkeleton(JSON.stringify(doc))!;
    const pose = cloneSkeleton2D(result.skeleton);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, result.skeleton, pose, 0.5);
    expect(pose.bones[0].rotation).toBeCloseTo(90 * easeCubicBezier(0.42, 0, 1, 1)(0.5), 4);
    expect(pose.bones[0].rotation).toBeLessThan(40); // materially different from the linear 45
  });

  it('no longer Skip-crumbs a curve, but still crumbs a QUADRATIC tweenEasing', () => {
    const curved = {
      frameRate: 10,
      armature: [
        {
          bone: [{ name: 'b' }],
          animation: [
            {
              name: 'a',
              bone: [{ name: 'b', rotateFrame: [{ duration: 10, rotate: 0, curve: [0.42, 0, 1, 1] }, { rotate: 90 }] }],
            },
          ],
        },
      ],
    };
    expect(
      collectImportDiagnostics((sink) => parseDragonBonesSkeleton(JSON.stringify(curved), sink)).map((c) => c.kind),
    ).not.toContain('dragonbones.tween-easing-unsupported');

    // The quadratic variants have no corpus coverage, so they stay reported rather than guessed.
    const quad = {
      frameRate: 10,
      armature: [
        {
          bone: [{ name: 'b' }],
          animation: [
            {
              name: 'a',
              bone: [{ name: 'b', rotateFrame: [{ duration: 10, rotate: 0, tweenEasing: 0.5 }, { rotate: 90 }] }],
            },
          ],
        },
      ],
    };
    expect(
      collectImportDiagnostics((sink) => parseDragonBonesSkeleton(JSON.stringify(quad), sink)).map((c) => c.kind),
    ).toContain('dragonbones.tween-easing-unsupported');
  });

  it('leaves an uncurved DragonBones timeline with no segment easings', () => {
    const doc = {
      frameRate: 10,
      armature: [
        {
          bone: [{ name: 'b' }],
          animation: [{ name: 'a', bone: [{ name: 'b', rotateFrame: [{ duration: 10, rotate: 0 }, { rotate: 90 }] }] }],
        },
      ],
    };
    const track = parseDragonBonesSkeleton(JSON.stringify(doc))!.animations[0].clip.channels[0].track;
    expect(track.segmentEasings).toBeNull();
  });

  it('emits a bone with an unresolved parent as a root and Skip-crumbs it', () => {
    const doc = { armature: [{ bone: [{ name: 'orphan', parent: 'ghost' }] }] };
    const kinds = collectImportDiagnostics((sink) => parseDragonBonesSkeleton(JSON.stringify(doc), sink)).map(
      (c) => c.kind,
    );
    const crumbs = collectImportDiagnostics((sink) => parseDragonBonesSkeleton(JSON.stringify(doc), sink));
    expect(kinds).toContain('dragonbones.unresolved-bone-parent');
    // Drop, not Skip: the feature is supported and the DATA failed, so this is lost data rather than a
    // capability gap. Pinned because a Skip here would exempt itself from every severity-based check.
    expect(crumbs.find((c) => c.kind === 'dragonbones.unresolved-bone-parent')!.severity).toBe(
      ImportDiagnosticSeverity.Drop,
    );
    expect(parseDragonBonesSkeleton(JSON.stringify(doc))!.skeleton.bones[0].parentIndex).toBe(-1);
  });

  it('builds a named clip of RELATIVE deltas on a frameRate-converted time axis', () => {
    const doc = {
      frameRate: 20,
      armature: [
        {
          bone: [{ name: 'root', transform: { x: 5, skX: 10, skY: 10, scX: 2 } }],
          animation: [
            {
              name: 'walk',
              duration: 10,
              bone: [
                {
                  name: 'root',
                  translateFrame: [
                    { duration: 10, x: 0, y: 0 },
                    { duration: 0, x: 20, y: 4 },
                  ],
                  rotateFrame: [
                    { duration: 10, rotate: 0 },
                    { duration: 0, rotate: 90 },
                  ],
                  scaleFrame: [
                    { duration: 10, x: 1, y: 1 },
                    { duration: 0, x: 3, y: 1 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = parseDragonBonesSkeleton(JSON.stringify(doc))!;
    expect(result.animations.length).toBe(1);
    expect(result.animations[0].name).toBe('walk');
    // 10 frames at 20fps = 0.5s, so the second keyframe lands at t=0.5 on every timeline.
    expect(
      findChannel(result.animations[0].clip.channels, 0, Skeleton2DAnimationPath.Translation)!.track.times,
    ).toEqual([0, 0.5]);
    // Compose onto a pose clone at the end key: setup x 5 + 20, rotation 10 + 90, scaleX 2 × 3 (multiplier).
    const setup = result.skeleton;
    const pose = cloneSkeleton2D(setup);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, setup, pose, 0.5);
    expect(pose.bones[0].x).toBeCloseTo(25, 5);
    expect(pose.bones[0].y).toBeCloseTo(4, 5);
    expect(pose.bones[0].rotation).toBeCloseTo(100, 5);
    expect(pose.bones[0].scaleX).toBeCloseTo(6, 5);
    expect(setup.bones[0].x).toBe(5); // the parsed setup pose is left intact
  });

  it('FORMULA: a keyframe time is the running frame-duration sum divided by the frame rate', () => {
    // Durations 4, 6, 5 at 24fps → cumulative 0, 4, 10 frames → 0, 1/6, 5/12 seconds. An omitted `duration`
    // is DragonBones' 1-frame default, and a negative one is clamped so the axis stays ascending.
    const doc = {
      frameRate: 24,
      armature: [
        {
          bone: [{ name: 'b' }],
          animation: [
            {
              name: 'a',
              bone: [
                {
                  name: 'b',
                  translateFrame: [
                    { duration: 4, x: 0 },
                    { duration: 6, x: 1 },
                    { duration: 5, x: 2 },
                    { x: 3 },
                    { duration: -8, x: 4 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const times = parseDragonBonesSkeleton(JSON.stringify(doc))!.animations[0].clip.channels[0].track.times;
    expect(Array.from(times)).toEqual([0, 4 / 24, 10 / 24, 15 / 24, 16 / 24]);
  });

  it('takes the armature frame rate over the document, and 24fps when neither is usable', () => {
    const withArmatureRate = {
      frameRate: 20,
      armature: [{ frameRate: 10, bone: [{ name: 'b' }], animation: [{ bone: [translateTo('b', 12)] }] }],
    };
    expect(firstKeyEndTime(withArmatureRate)).toBeCloseTo(12 / 10, 5);
    const withDocumentRate = {
      frameRate: 20,
      armature: [{ bone: [{ name: 'b' }], animation: [{ bone: [translateTo('b', 12)] }] }],
    };
    expect(firstKeyEndTime(withDocumentRate)).toBeCloseTo(12 / 20, 5);
    // A zero rate would divide every time to Infinity, so it falls back rather than poisoning the axis.
    const withZeroRate = {
      frameRate: 0,
      armature: [{ bone: [{ name: 'b' }], animation: [{ bone: [translateTo('b', 12)] }] }],
    };
    expect(firstKeyEndTime(withZeroRate)).toBeCloseTo(12 / 24, 5);
  });

  it('UNWRAPS a rotate sequence so a wrapped angle pair tweens the authored short step', () => {
    // 170° followed by an authored −170° is a +20° step, not the 340° long way round through zero.
    const doc = rotateDoc([
      { duration: 10, rotate: 170 },
      { duration: 10, rotate: -170 },
    ]);
    const result = parseDragonBonesSkeleton(JSON.stringify(doc))!;
    const channel = findChannel(result.animations[0].clip.channels, 0, Skeleton2DAnimationPath.Rotation)!;
    expect(Array.from(channel.track.values)).toEqual([170, 190]);
    const pose = cloneSkeleton2D(result.skeleton);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, result.skeleton, pose, 0.25);
    expect(pose.bones[0].rotation).toBeCloseTo(180, 5); // halfway along the short step, not through 0
  });

  it('adds a whole turn per unconsumed `clockwise` when the authored angle wrapped past the previous one', () => {
    const doc = rotateDoc([
      { duration: 10, rotate: 90, clockwise: 1 },
      { duration: 10, rotate: 0 },
    ]);
    const channel = findChannel(
      parseDragonBonesSkeleton(JSON.stringify(doc))!.animations[0].clip.channels,
      0,
      Skeleton2DAnimationPath.Rotation,
    )!;
    expect(Array.from(channel.track.values)).toEqual([90, 360]);
  });

  // ★ THE COUNTER-CLOCKWISE HALF OF THE SAME MECHANISM, which had never run. `clockwise` is a SIGNED spin
  // count — an animator saying "turn twice the long way round" — and the unwrap has two mirrored branches:
  // a positive count consumes a turn when the authored angle rose past the previous one, a negative count
  // consumes one when it fell below. Only the positive side was exercised, so the sign test and the
  // decrement/increment were each half covered. A wrong sign here is a bone spinning backwards through an
  // animation, which no static assertion about a pose would catch.
  //
  // Both expectations are derived from the rule rather than read off the output: with previousRotation 90
  // and one unconsumed counter-clockwise turn, 180 becomes 180 - 360 = -180.
  it('subtracts a whole turn per unconsumed negative `clockwise`, mirroring the positive case', () => {
    const doc = rotateDoc([
      { clockwise: -1, duration: 10, rotate: 90 },
      { duration: 10, rotate: 180 },
    ]);

    const channel = findChannel(
      parseDragonBonesSkeleton(JSON.stringify(doc))!.animations[0].clip.channels,
      0,
      Skeleton2DAnimationPath.Rotation,
    )!;

    expect(Array.from(channel.track.values)).toEqual([90, -180]);
  });

  // The other arm of the same condition: the authored angle FELL below the previous one, which is the
  // direction a counter-clockwise turn already travels, so the spin is consumed and no 360 is added.
  // Together with the test above this pins both arms of the sign test and both of the counter.
  it('consumes a negative `clockwise` when the authored angle already fell below the previous one', () => {
    const doc = rotateDoc([
      { clockwise: -1, duration: 10, rotate: 90 },
      { duration: 10, rotate: 0 },
    ]);

    const channel = findChannel(
      parseDragonBonesSkeleton(JSON.stringify(doc))!.animations[0].clip.channels,
      0,
      Skeleton2DAnimationPath.Rotation,
    )!;

    expect(Array.from(channel.track.values)).toEqual([90, 0]);
  });

  it('maps rotateFrame `skew` to a Shear channel, and emits none when no frame skews', () => {
    const skewed = parseDragonBonesSkeleton(
      JSON.stringify(
        rotateDoc([
          { duration: 10, rotate: 0, skew: 0 },
          { duration: 10, rotate: 0, skew: 30 },
        ]),
      ),
    )!;
    const shear = findChannel(skewed.animations[0].clip.channels, 0, Skeleton2DAnimationPath.Shear)!;
    // DragonBones' skew is Flight's shearY; shearX stays 0, the same split the setup transform uses.
    expect(Array.from(shear.track.values)).toEqual([0, 0, 0, 30]);
    const pose = cloneSkeleton2D(skewed.skeleton);
    applyAnimationClipToSkeleton2D(skewed.animations[0].clip, skewed.skeleton, pose, 0.5);
    expect(pose.bones[0].shearY).toBeCloseTo(30, 5);
    expect(pose.bones[0].shearX).toBeCloseTo(0, 5);

    const unskewed = parseDragonBonesSkeleton(JSON.stringify(rotateDoc([{ duration: 10, rotate: 45 }])))!;
    expect(findChannel(unskewed.animations[0].clip.channels, 0, Skeleton2DAnimationPath.Shear)).toBeUndefined();
  });

  it('uses Step interpolation when every tweening frame declares no tween', () => {
    const stepped = parseDragonBonesSkeleton(
      JSON.stringify(
        rotateDoc([
          { duration: 10, rotate: 0, tweenEasing: null },
          { duration: 10, rotate: 90, tweenEasing: null },
        ]),
      ),
    )!;
    const pose = cloneSkeleton2D(stepped.skeleton);
    applyAnimationClipToSkeleton2D(stepped.animations[0].clip, stepped.skeleton, pose, 0.4);
    expect(pose.bones[0].rotation).toBeCloseTo(0, 5); // holds the first key until the second

    // An ABSENT tweenEasing means linear, not stepped — so the same times tween.
    const tweened = parseDragonBonesSkeleton(
      JSON.stringify(
        rotateDoc([
          { duration: 10, rotate: 0 },
          { duration: 10, rotate: 90 },
        ]),
      ),
    )!;
    const tweenedPose = cloneSkeleton2D(tweened.skeleton);
    applyAnimationClipToSkeleton2D(tweened.animations[0].clip, tweened.skeleton, tweenedPose, 0.25);
    expect(tweenedPose.bones[0].rotation).toBeCloseTo(45, 5);
  });

  it("ignores the last frame's easing, which opens no segment", () => {
    // Only the trailing frame tweens; DragonBones gives a final frame no tween either, so the track is Step.
    const doc = rotateDoc([
      { duration: 10, rotate: 0, tweenEasing: null },
      { duration: 10, rotate: 90, tweenEasing: 0 },
    ]);
    const result = parseDragonBonesSkeleton(JSON.stringify(doc))!;
    const pose = cloneSkeleton2D(result.skeleton);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, result.skeleton, pose, 0.4);
    expect(pose.bones[0].rotation).toBeCloseTo(0, 5);
  });

  it('applies the scale-frame identity default of 1 to an omitted component', () => {
    const doc = {
      frameRate: 24,
      armature: [
        {
          bone: [{ name: 'b', transform: { scX: 2, scY: 3 } }],
          animation: [{ bone: [{ name: 'b', scaleFrame: [{ duration: 10 }] }] }],
        },
      ],
    };
    const result = parseDragonBonesSkeleton(JSON.stringify(doc))!;
    const pose = cloneSkeleton2D(result.skeleton);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, result.skeleton, pose, 0);
    expect(pose.bones[0].scaleX).toBeCloseTo(2, 5); // 2 × 1, unchanged from setup
    expect(pose.bones[0].scaleY).toBeCloseTo(3, 5);
  });

  it('takes the clip duration from the declared frame count, which can outlast the last keyframe', () => {
    const doc = {
      frameRate: 20,
      armature: [
        {
          bone: [{ name: 'b' }],
          animation: [{ name: 'hold', duration: 30, bone: [{ name: 'b', translateFrame: [{ duration: 10, x: 1 }] }] }],
        },
      ],
    };
    expect(parseDragonBonesSkeleton(JSON.stringify(doc))!.animations[0].clip.duration).toBeCloseTo(1.5, 5);
  });

  it('holds a malformed keyframe in place so the later keyframes keep their times', () => {
    const doc = {
      frameRate: 20,
      armature: [
        {
          bone: [{ name: 'b' }],
          animation: [
            {
              bone: [{ name: 'b', translateFrame: [{ duration: 10, x: 0 }, null, { duration: 0, x: 30 }] }],
            },
          ],
        },
      ],
    };
    const kinds = collectImportDiagnostics((sink) => parseDragonBonesSkeleton(JSON.stringify(doc), sink)).map(
      (c) => c.kind,
    );
    expect(kinds).toContain('dragonbones.malformed-frame-recovered');
    // The placeholder keeps its default 1-frame duration: 0, 10/20, 11/20 — the last key is not pulled earlier.
    const times = parseDragonBonesSkeleton(JSON.stringify(doc))!.animations[0].clip.channels[0].track.times;
    expect(Array.from(times)).toEqual([0, 0.5, 0.55]);
  });

  it('drops a timeline naming an absent bone and Recover-crumbs it once', () => {
    const doc = {
      armature: [
        {
          bone: [{ name: 'b' }],
          animation: [
            { name: 'a', bone: [translateTo('ghost', 10), translateTo('alsoGhost', 10), translateTo('b', 10)] },
          ],
        },
      ],
    };
    const crumbs = collectImportDiagnostics((sink) => parseDragonBonesSkeleton(JSON.stringify(doc), sink)).filter(
      (c) => c.kind === 'dragonbones.animation-bone-unresolved',
    );
    expect(crumbs.length).toBe(1);
    expect(crumbs[0].detail).toMatchObject({ bones: 2 });
    // Only the resolvable bone produced a channel.
    expect(parseDragonBonesSkeleton(JSON.stringify(doc))!.animations[0].clip.channels.length).toBe(1);
  });

  it('Skip-crumbs the unmodeled animation timelines and non-linear frame easing', () => {
    const doc = {
      armature: [
        {
          bone: [{ name: 'b' }],
          animation: [
            {
              name: 'a',
              bone: [
                {
                  name: 'b',
                  frame: [{ duration: 1, transform: { x: 1 } }],
                  translateFrame: [
                    { duration: 5, x: 0, tweenEasing: 0.5 },
                    { duration: 5, x: 1, curve: [0.1, 0.2, 0.3, 0.4] },
                    { duration: 0, x: 2 },
                  ],
                },
              ],
              slot: [{ name: 's' }],
              ffd: [{ name: 'd' }],
              ik: [{ name: 'k' }],
              zOrder: { frame: [{ duration: 1 }] },
            },
          ],
        },
      ],
    };
    const kinds = collectImportDiagnostics((sink) => parseDragonBonesSkeleton(JSON.stringify(doc), sink)).map(
      (c) => c.kind,
    );
    expect(kinds).toContain('dragonbones.slot-timeline-unsupported');
    expect(kinds).toContain('dragonbones.deform-timeline-unsupported');
    expect(kinds).toContain('dragonbones.ik-timeline-unsupported');
    expect(kinds).toContain('dragonbones.zorder-timeline-unsupported');
    expect(kinds).toContain('dragonbones.legacy-bone-frame-unsupported');
    expect(kinds).toContain('dragonbones.tween-easing-unsupported');
  });

  it('returns null for malformed JSON and for a non-DragonBones document (no armature)', () => {
    expect(parseDragonBonesSkeleton('{ not json')).toBeNull();
    expect(parseDragonBonesSkeleton('42')).toBeNull();
    expect(parseDragonBonesSkeleton(JSON.stringify({ bones: [] }))).toBeNull(); // a Spine-shaped doc
    expect(parseDragonBonesSkeleton(JSON.stringify({ armature: [] }))).toBeNull(); // empty armature list
  });
});

describe('parseDragonBonesSkeleton type resilience', () => {
  it('never trusts a field type: any value replaced by a wrong-typed one still imports coherently', () => {
    const paths = everyJsonPath(DB_RICH);
    expect(paths.length, 'the rich document walked no paths').toBeGreaterThan(40);

    for (const path of paths) {
      for (const wrong of [42, 'wrong', [], {}, null, true]) {
        const label = `${path.join('.')} = ${JSON.stringify(wrong)}`;
        const json = JSON.stringify(withValueAt(DB_RICH, path, wrong));
        let result: ReturnType<typeof parseDragonBonesSkeleton> | undefined;
        expect(() => {
          result = parseDragonBonesSkeleton(json);
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

// The channel a (bone, path) pair drives, or undefined when the parse emitted none for it.
function findChannel(
  channels: readonly AnimationChannel[],
  boneIndex: number,
  path: Skeleton2DAnimationPath,
): AnimationChannel | undefined {
  return channels.find((channel) => {
    const target = channel.targetRef as Skeleton2DAnimationTarget;
    return target.boneIndex === boneIndex && target.path === path;
  });
}

// The time of the SECOND keyframe of the document's first channel — the frame-rate conversion under test
// (the first keyframe is always 0, so it proves nothing about the rate).
function firstKeyEndTime(doc: unknown): number {
  return parseDragonBonesSkeleton(JSON.stringify(doc))!.animations[0].clip.channels[0].track.times[1];
}

// A one-bone 20fps document whose single animation carries `frames` as bone `b`'s rotateFrame list.
function rotateDoc(frames: readonly Record<string, unknown>[]): Record<string, unknown> {
  return {
    frameRate: 20,
    armature: [{ bone: [{ name: 'b' }], animation: [{ name: 'a', bone: [{ name: 'b', rotateFrame: frames }] }] }],
  };
}

// A two-keyframe translate timeline for `boneName` whose first frame lasts `duration` FRAMES, so the second
// keyframe's time is exactly `duration / frameRate`.
function translateTo(boneName: string, duration: number): Record<string, unknown> {
  return {
    name: boneName,
    translateFrame: [
      { duration, x: 0 },
      { duration: 0, x: 1 },
    ],
  };
}
