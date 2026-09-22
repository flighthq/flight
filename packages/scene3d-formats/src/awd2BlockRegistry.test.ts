import {
  awd2AllBlockHandlers,
  awd2CameraFamily,
  awd2GeometryFamily,
  awd2LightingFamily,
  awd2MaterialsFamily,
  awd2SceneStructureFamily,
  awd2SkeletonFamily,
} from './awd2BlockRegistry';
import {
  AWD2_BLOCK_CAMERA,
  AWD2_BLOCK_CONTAINER,
  AWD2_BLOCK_LIGHT,
  AWD2_BLOCK_LIGHT_PICKER,
  AWD2_BLOCK_MATERIAL,
  AWD2_BLOCK_MESH_INSTANCE,
  AWD2_BLOCK_SKELETON,
  AWD2_BLOCK_SKELETON_ANIMATION,
  AWD2_BLOCK_SKELETON_POSE,
  AWD2_BLOCK_TEXTURE,
  AWD2_BLOCK_TRIANGLE_GEOMETRY,
} from './awd2Schema';

const claimedBy = (family: readonly { readonly blockTypes: readonly number[] }[]): number[] =>
  family.flatMap((handler) => [...handler.blockTypes]).sort((a, b) => a - b);

describe('awd2AllBlockHandlers', () => {
  // Build phases run in array order and depend on each other, so this is a behavioural assertion, not a
  // stylistic one: materials install the resolver scene structure reads, the skeleton builds the joint
  // nodes mesh instances bind to, and scene structure creates the nodes lighting and camera parent to.
  it('composes the families in build order', () => {
    expect(awd2AllBlockHandlers).toEqual([
      ...awd2MaterialsFamily,
      ...awd2SkeletonFamily,
      ...awd2GeometryFamily,
      ...awd2SceneStructureFamily,
      ...awd2LightingFamily,
      ...awd2CameraFamily,
    ]);
  });

  it('claims all eleven block types, each exactly once', () => {
    // Two handlers claiming one type would make the table's contents depend on array order, so the build
    // a caller described would not be the build they got.
    const claimed = claimedBy(awd2AllBlockHandlers);
    expect(new Set(claimed).size).toBe(claimed.length);
    expect(claimed).toEqual(
      [
        AWD2_BLOCK_TRIANGLE_GEOMETRY,
        AWD2_BLOCK_CONTAINER,
        AWD2_BLOCK_MESH_INSTANCE,
        AWD2_BLOCK_LIGHT,
        AWD2_BLOCK_CAMERA,
        AWD2_BLOCK_LIGHT_PICKER,
        AWD2_BLOCK_MATERIAL,
        AWD2_BLOCK_TEXTURE,
        AWD2_BLOCK_SKELETON,
        AWD2_BLOCK_SKELETON_POSE,
        AWD2_BLOCK_SKELETON_ANIMATION,
      ].sort((a, b) => a - b),
    );
  });

  // The preset is the only module naming all six families, so a family added to the codebase but left
  // out of it would ship unreachable through the zero-config path.
  it('contains every family, so none can be added without reaching the preset', () => {
    for (const family of [
      awd2CameraFamily,
      awd2GeometryFamily,
      awd2LightingFamily,
      awd2MaterialsFamily,
      awd2SceneStructureFamily,
      awd2SkeletonFamily,
    ]) {
      for (const handler of family) expect(awd2AllBlockHandlers).toContain(handler);
    }
  });
});

describe('awd2CameraFamily', () => {
  it('claims the camera block', () => {
    expect(claimedBy(awd2CameraFamily)).toEqual([AWD2_BLOCK_CAMERA]);
  });
});

describe('awd2GeometryFamily', () => {
  it('claims the triangle geometry block', () => {
    expect(claimedBy(awd2GeometryFamily)).toEqual([AWD2_BLOCK_TRIANGLE_GEOMETRY]);
  });
});

describe('awd2LightingFamily', () => {
  it('claims the light and picker blocks', () => {
    expect(claimedBy(awd2LightingFamily)).toEqual([AWD2_BLOCK_LIGHT, AWD2_BLOCK_LIGHT_PICKER].sort((a, b) => a - b));
  });
});

describe('awd2MaterialsFamily', () => {
  it('claims the material and texture blocks', () => {
    expect(claimedBy(awd2MaterialsFamily)).toEqual([AWD2_BLOCK_MATERIAL, AWD2_BLOCK_TEXTURE].sort((a, b) => a - b));
  });
});

describe('awd2SceneStructureFamily', () => {
  it('claims the container and mesh-instance blocks', () => {
    expect(claimedBy(awd2SceneStructureFamily)).toEqual(
      [AWD2_BLOCK_CONTAINER, AWD2_BLOCK_MESH_INSTANCE].sort((a, b) => a - b),
    );
  });
});

describe('awd2SkeletonFamily', () => {
  it('claims the skeleton, pose and animation blocks', () => {
    expect(claimedBy(awd2SkeletonFamily)).toEqual(
      [AWD2_BLOCK_SKELETON, AWD2_BLOCK_SKELETON_POSE, AWD2_BLOCK_SKELETON_ANIMATION].sort((a, b) => a - b),
    );
  });

  // The skeleton block is written first and its poses are written against it, so the family mixes a
  // first-pass handler with two second-pass ones. That mix is why `deferred` is a per-handler flag.
  it('defers the pose and animation handlers but not the skeleton block', () => {
    const deferred = awd2SkeletonFamily.filter((handler) => handler.deferred === true);
    expect(deferred).toHaveLength(2);
    expect(awd2SkeletonFamily.filter((handler) => handler.deferred !== true)).toHaveLength(1);
    for (const handler of deferred) expect(handler.blockTypes).not.toContain(AWD2_BLOCK_SKELETON);
  });
});
