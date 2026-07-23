import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { createMesh, createScene } from '@flighthq/scene';
import { emitSignal } from '@flighthq/signals';
import { createTexture } from '@flighthq/texture';
import { createTweenManager, hasTweensOf, updateTweens } from '@flighthq/tween';
import type { Scene } from '@flighthq/types';
import type {
  EmbeddedImageResourceReference,
  ImageResource,
  SceneNode,
  SceneResourceEvent,
  Texture,
} from '@flighthq/types';
import { ResourceResolutionState } from '@flighthq/types';

import { revealSceneResourcesOnResolve } from './revealSceneResourcesOnResolve';
import { createBuiltInSceneResourceResolver } from './sceneResourceResolver';
import { enableSceneResourceSignals } from './sceneResourceSignals';

function pendingRef(): EmbeddedImageResourceReference {
  return {
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    failure: null,
    kind: 'Embedded',
    mimeType: 'image/png',
    state: ResourceResolutionState.Unresolved,
  };
}

function sceneWithPendingTexture(): { mesh: SceneNode; scene: Scene; texture: Texture } {
  const texture = createTexture({ resource: pendingRef() });
  const material = createStandardPbrMaterial({ baseColorMap: texture });
  const mesh = createMesh(createBoxMeshGeometry(), [material]);
  const scene = createScene();
  addNodeChild(scene.root, mesh);
  return { mesh, scene, texture };
}

describe('revealSceneResourcesOnResolve', () => {
  it('hides every object carrying a pending texture to the start opacity up front', () => {
    const { mesh, scene } = sceneWithPendingTexture();
    const resolver = createBuiltInSceneResourceResolver();
    revealSceneResourcesOnResolve(resolver, scene.root, createTweenManager());
    expect(mesh.alpha).toBe(0);
  });

  it('honors a custom from opacity', () => {
    const { mesh, scene } = sceneWithPendingTexture();
    const resolver = createBuiltInSceneResourceResolver();
    revealSceneResourcesOnResolve(resolver, scene.root, createTweenManager(), { from: 0.2 });
    expect(mesh.alpha).toBeCloseTo(0.2);
  });

  it('fades the owning object to full opacity as its texture resolves', () => {
    const { mesh, scene, texture } = sceneWithPendingTexture();
    const resolver = createBuiltInSceneResourceResolver();
    const manager = createTweenManager();
    revealSceneResourcesOnResolve(resolver, scene.root, manager, { fadeSeconds: 0.5 });
    expect(mesh.alpha).toBe(0);

    const signals = enableSceneResourceSignals(resolver);
    const event: SceneResourceEvent = { ref: texture.resource!, texture };
    emitSignal(signals.onResourceResolved, event);
    expect(hasTweensOf(manager, mesh)).toBe(true);

    updateTweens(manager, 0.5);
    expect(mesh.alpha).toBeCloseTo(1);
  });

  it('waits for every required texture across a material before revealing its owner', () => {
    const baseColorMap = createTexture({ resource: pendingRef() });
    const normalMap = createTexture({ resource: pendingRef() });
    const material = createStandardPbrMaterial({ baseColorMap, normalMap });
    const mesh = createMesh(createBoxMeshGeometry(), [material]);
    const scene = createScene();
    addNodeChild(scene.root, mesh);
    const resolver = createBuiltInSceneResourceResolver();
    const manager = createTweenManager();
    revealSceneResourcesOnResolve(resolver, scene.root, manager, { fadeSeconds: 0.5 });

    const signals = enableSceneResourceSignals(resolver);
    emitSignal(signals.onResourceResolved, { ref: baseColorMap.resource!, texture: baseColorMap });
    expect(hasTweensOf(manager, mesh)).toBe(false);

    emitSignal(signals.onResourceResolved, { ref: normalMap.resource!, texture: normalMap });
    expect(hasTweensOf(manager, mesh)).toBe(true);
  });

  it('treats failure as settled and reveals the fallback only after the remaining resources settle', () => {
    const baseColorMap = createTexture({ resource: pendingRef() });
    const normalMap = createTexture({ resource: pendingRef() });
    const material = createStandardPbrMaterial({ baseColorMap, normalMap });
    const mesh = createMesh(createBoxMeshGeometry(), [material]);
    const scene = createScene();
    addNodeChild(scene.root, mesh);
    const resolver = createBuiltInSceneResourceResolver();
    const manager = createTweenManager();
    revealSceneResourcesOnResolve(resolver, scene.root, manager, { fadeSeconds: 0.5 });

    const signals = enableSceneResourceSignals(resolver);
    emitSignal(signals.onResourceFailed, { ref: normalMap.resource!, texture: normalMap });
    expect(hasTweensOf(manager, mesh)).toBe(false);

    emitSignal(signals.onResourceResolved, { ref: baseColorMap.resource!, texture: baseColorMap });
    expect(hasTweensOf(manager, mesh)).toBe(true);
  });

  it('does not hide an owner whose resource was already bound or had already failed', () => {
    const bound = createTexture({
      image: { height: 1, width: 1 } as ImageResource,
      resource: pendingRef(),
    });
    const failedRef = pendingRef();
    failedRef.state = ResourceResolutionState.Failed;
    const failed = createTexture({ resource: failedRef });
    const material = createStandardPbrMaterial({ baseColorMap: bound, normalMap: failed });
    const mesh = createMesh(createBoxMeshGeometry(), [material]);
    const scene = createScene();
    addNodeChild(scene.root, mesh);

    revealSceneResourcesOnResolve(createBuiltInSceneResourceResolver(), scene.root, createTweenManager());
    expect(mesh.alpha).toBe(1);
  });

  it('reveals every owner of one shared texture when that texture settles', () => {
    const texture = createTexture({ resource: pendingRef() });
    const a = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial({ baseColorMap: texture })]);
    const b = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial({ baseColorMap: texture })]);
    const scene = createScene();
    addNodeChild(scene.root, a);
    addNodeChild(scene.root, b);
    const resolver = createBuiltInSceneResourceResolver();
    const manager = createTweenManager();
    revealSceneResourcesOnResolve(resolver, scene.root, manager);

    emitSignal(enableSceneResourceSignals(resolver).onResourceResolved, { ref: texture.resource!, texture });
    expect(hasTweensOf(manager, a)).toBe(true);
    expect(hasTweensOf(manager, b)).toBe(true);
  });

  it('ignores a resolve event for a texture it is not tracking', () => {
    const { scene } = sceneWithPendingTexture();
    const resolver = createBuiltInSceneResourceResolver();
    const manager = createTweenManager();
    revealSceneResourcesOnResolve(resolver, scene.root, manager, { fadeSeconds: 0.5 });

    const stray = createTexture({ resource: pendingRef() });
    emitSignal(enableSceneResourceSignals(resolver).onResourceResolved, { ref: stray.resource!, texture: stray });
    expect(hasTweensOf(manager, stray as unknown as object)).toBe(false);
  });

  it('disconnects the listener when the returned disposer runs', () => {
    const { mesh, scene, texture } = sceneWithPendingTexture();
    const resolver = createBuiltInSceneResourceResolver();
    const manager = createTweenManager();
    const dispose = revealSceneResourcesOnResolve(resolver, scene.root, manager, { fadeSeconds: 0.5 });
    dispose();

    emitSignal(enableSceneResourceSignals(resolver).onResourceResolved, { ref: texture.resource!, texture });
    expect(hasTweensOf(manager, mesh)).toBe(false);
  });
});
