import { collectImportDiagnostics } from '@flighthq/importdiagnostics/contract';
import type { ImportDiagnostic, MeshAttachment2D, RegionAttachment2D } from '@flighthq/types/contract';
import { MeshAttachment2DKind, RegionAttachment2DKind, TransformMode2D } from '@flighthq/types/contract';
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

  it('Skip-crumbs additional armatures, alternate skins, and the unmodeled animation section', () => {
    const doc = {
      armature: [
        {
          bone: [{ name: 'root' }],
          slot: [{ name: 's', parent: 'root' }],
          skin: [
            { name: 'default', slot: [] },
            { name: 'costume2', slot: [] },
          ],
          animation: [{ name: 'idle', duration: 1 }],
        },
        { bone: [{ name: 'other' }] },
      ],
    };
    const crumbs: ImportDiagnostic[] = collectImportDiagnostics((sink) =>
      parseDragonBonesSkeleton(JSON.stringify(doc), sink),
    );
    const kinds = crumbs.map((c) => c.kind);
    expect(kinds).toContain('dragonbones.multi-armature-unsupported');
    expect(kinds).toContain('dragonbones.alternate-skin-unsupported');
    expect(kinds).toContain('dragonbones.animation-unsupported');
    // Only the first armature is parsed.
    expect(parseDragonBonesSkeleton(JSON.stringify(doc))!.skeleton.bones[0].name).toBe('root');
  });

  it('emits a bone with an unresolved parent as a root and Skip-crumbs it', () => {
    const doc = { armature: [{ bone: [{ name: 'orphan', parent: 'ghost' }] }] };
    const kinds = collectImportDiagnostics((sink) => parseDragonBonesSkeleton(JSON.stringify(doc), sink)).map(
      (c) => c.kind,
    );
    expect(kinds).toContain('dragonbones.unresolved-bone-parent');
    expect(parseDragonBonesSkeleton(JSON.stringify(doc))!.skeleton.bones[0].parentIndex).toBe(-1);
  });

  it('returns null for malformed JSON and for a non-DragonBones document (no armature)', () => {
    expect(parseDragonBonesSkeleton('{ not json')).toBeNull();
    expect(parseDragonBonesSkeleton('42')).toBeNull();
    expect(parseDragonBonesSkeleton(JSON.stringify({ bones: [] }))).toBeNull(); // a Spine-shaped doc
    expect(parseDragonBonesSkeleton(JSON.stringify({ armature: [] }))).toBeNull(); // empty armature list
  });
});
