// Exact narrow bridge for the Scene3D-GL owner contract project. These shared headers remain in
// Types until their own packages gain acyclic contract lanes; keeping the bridge here prevents the
// owner project from selecting an unrelated suffix barrel or depending on the full Types project.
export type { Camera3D } from './Camera3D.ts';
export type { Environment } from './Environment.ts';
export type { GlSkinPaletteTexture } from './GlSkinPaletteTexture.ts';
export type { Kind } from './Entity.ts';
export type { Mesh } from './Mesh.ts';
export type { MeshGeometry } from './MeshGeometry.ts';
export type { Modifier } from './Modifier.ts';
export type { ModifierDefinition } from './ModifierDefinition.ts';
export type { Node3D } from './Node3D.ts';
export type { Scene3DLightBlock } from './Scene3DLightBlock.ts';
export type { Scene3DLightsLike } from './Scene3DLights.ts';
export type { Scene3DRenderProxy } from './Scene3DRenderProxy.ts';
