import { AWD2_BLOCK_BUILD_ORDER, getAwd2BlockHandlers } from './awd2BlockDispatch';
import {
  awd2LightingFamily,
  awd2MaterialsFamily,
  awd2SceneStructureFamily,
  awd2SkeletonFamily,
  createAwd2DefaultBlockRegistry,
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

describe('awd2LightingFamily', () => {
  it('claims the light and picker blocks', () => {
    expect([...awd2LightingFamily().blockTypes].sort((a, b) => a - b)).toEqual(
      [AWD2_BLOCK_LIGHT, AWD2_BLOCK_LIGHT_PICKER].sort((a, b) => a - b),
    );
  });
});

describe('awd2MaterialsFamily', () => {
  it('claims the material and texture blocks', () => {
    expect([...awd2MaterialsFamily().blockTypes].sort((a, b) => a - b)).toEqual(
      [AWD2_BLOCK_MATERIAL, AWD2_BLOCK_TEXTURE].sort((a, b) => a - b),
    );
  });
});

describe('awd2SceneStructureFamily', () => {
  it('claims the container and mesh-instance blocks', () => {
    expect([...awd2SceneStructureFamily().blockTypes].sort((a, b) => a - b)).toEqual(
      [AWD2_BLOCK_CONTAINER, AWD2_BLOCK_MESH_INSTANCE].sort((a, b) => a - b),
    );
  });
});

describe('awd2SkeletonFamily', () => {
  it('claims the skeleton, pose and animation blocks', () => {
    expect([...awd2SkeletonFamily().blockTypes].sort((a, b) => a - b)).toEqual(
      [AWD2_BLOCK_SKELETON, AWD2_BLOCK_SKELETON_POSE, AWD2_BLOCK_SKELETON_ANIMATION].sort((a, b) => a - b),
    );
  });

  // The skeleton block is written first and its poses are written against it, so the family mixes a
  // first-pass part with two second-pass ones. That mix is exactly why the walk dispatches to parts.
  it('defers the pose and animation parts but not the skeleton block', () => {
    const parts = awd2SkeletonFamily().parts!;
    const deferred = parts.filter((part) => part.deferred === true);
    expect(deferred).toHaveLength(2);
    expect(parts.filter((part) => part.deferred !== true)).toHaveLength(1);
    for (const part of deferred) expect(part.blockTypes).not.toContain(AWD2_BLOCK_SKELETON);
  });
});

describe('createAwd2DefaultBlockRegistry', () => {
  it('fills every slot the registry declares', () => {
    const registry = createAwd2DefaultBlockRegistry();
    // Read off the slot list rather than a hand-written one, so a new family cannot be added to the type
    // and silently left out of the factory that is supposed to name them all.
    for (const slot of AWD2_BLOCK_BUILD_ORDER) expect(registry[slot], slot).toBeTruthy();
    expect(getAwd2BlockHandlers(registry)).toHaveLength(AWD2_BLOCK_BUILD_ORDER.length);
  });

  it('claims all eleven block types, each exactly once', () => {
    // Two handlers claiming one code would make the table's contents depend on slot order, so the build
    // a caller assembled would not be the build they described.
    const registry = createAwd2DefaultBlockRegistry();
    expect([...registry.dispatch.keys()].sort((a, b) => a - b)).toEqual(
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
});
