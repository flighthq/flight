import { awd2ContainerHandler, awd2MeshInstanceHandler } from './awd2SceneStructureHandler.ts';
import { AWD2_BLOCK_CONTAINER, AWD2_BLOCK_MESH_INSTANCE, AWD2_BUILD_PHASE_SCENE_STRUCTURE } from './awd2Schema.ts';

describe('awd2ContainerHandler', () => {
  it('claims the container block type', () => {
    expect(awd2ContainerHandler.blockTypes).toEqual([AWD2_BLOCK_CONTAINER]);
  });

  it('has a parse function', () => {
    expect(typeof awd2ContainerHandler.parse).toBe('function');
  });

  it('declares the scene structure build phase', () => {
    expect(awd2ContainerHandler.buildPhase).toBe(AWD2_BUILD_PHASE_SCENE_STRUCTURE);
    expect(typeof awd2ContainerHandler.build).toBe('function');
  });
});

describe('awd2MeshInstanceHandler', () => {
  it('claims the mesh instance block type', () => {
    expect(awd2MeshInstanceHandler.blockTypes).toEqual([AWD2_BLOCK_MESH_INSTANCE]);
  });

  it('has a parse function', () => {
    expect(typeof awd2MeshInstanceHandler.parse).toBe('function');
  });

  it('declares the scene structure build phase', () => {
    expect(awd2MeshInstanceHandler.buildPhase).toBe(AWD2_BUILD_PHASE_SCENE_STRUCTURE);
    expect(typeof awd2MeshInstanceHandler.build).toBe('function');
  });
});
