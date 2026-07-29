import { TransformMode2D } from '@flighthq/types/contract';
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
});
