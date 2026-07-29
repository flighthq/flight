import { collectImportDiagnostics } from '@flighthq/importdiagnostics/contract';
import type { ImportDiagnostic } from '@flighthq/types/contract';
import { TransformMode2D } from '@flighthq/types/contract';
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
            { name: 'onlyT', inheritRotation: false, inheritScale: false },
            { name: 'noScale', inheritScale: false },
            { name: 'noScaleRefl', inheritScale: false, inheritReflection: false },
            { name: 'noRot', inheritRotation: false, inheritReflection: false },
          ],
        },
      ],
    };
    const bones = parseDragonBonesSkeleton(JSON.stringify(doc))!.skeleton.bones;
    const mode = (name: string) => bones.find((b) => b.name === name)!.transformMode;
    expect(mode('normal')).toBe(TransformMode2D.Normal);
    expect(mode('onlyT')).toBe(TransformMode2D.OnlyTranslation);
    expect(mode('noScale')).toBe(TransformMode2D.NoScale);
    expect(mode('noScaleRefl')).toBe(TransformMode2D.NoScaleOrReflection);
    expect(mode('noRot')).toBe(TransformMode2D.NoRotationOrReflection);
  });

  it('Skip-crumbs an inheritance combo the five-value enum cannot express', () => {
    // inheritRotation false + inheritReflection true (scale kept): "strip rotation, keep reflection" has no
    // TransformMode2D — NoRotationOrReflection would also strip the reflection.
    const doc = { armature: [{ bone: [{ name: 'b', inheritRotation: false }] }] };
    const kinds = collectImportDiagnostics((sink) => parseDragonBonesSkeleton(JSON.stringify(doc), sink)).map(
      (c) => c.kind,
    );
    expect(kinds).toContain('dragonbones.inherit-mode-unmapped');
  });

  it('Skip-crumbs additional armatures and the unmodeled slot/skin/animation sections', () => {
    const doc = {
      armature: [
        {
          bone: [{ name: 'root' }],
          slot: [{ name: 's', parent: 'root' }],
          skin: [{ slot: [] }],
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
    expect(kinds).toContain('dragonbones.slot-unsupported');
    expect(kinds).toContain('dragonbones.skin-unsupported');
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
