import { createStandardPbrMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createMesh, createScene3D } from '@flighthq/scene3d/contract';
import { emitSignal } from '@flighthq/signals/contract';
import { createTexture } from '@flighthq/texture/contract';
import { createTweenManager, hasTweensOf, updateTweens } from '@flighthq/tween/contract';
import type { Scene3D } from '@flighthq/types/contract';
import type {
  EmbeddedImageResourceReference,
  ImageResource,
  Node3D,
  Scene3DResourceEvent,
  Texture,
} from '@flighthq/types/contract';
import { ResourceResolutionState } from '@flighthq/types/contract';

import { revealScene3DResourcesOnResolve } from './revealScene3DResourcesOnResolve';
import { createBuiltInScene3DResourceResolver } from './sceneResourceResolver';
import { enableScene3DResourceSignals } from './sceneResourceSignals';

function pendingRef(): EmbeddedImageResourceReference {
  return {
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    failure: null,
    kind: 'Embedded',
    mimeType: 'image/png',
    state: ResourceResolutionState.Unresolved,
  };
}

function sceneWithPendingTexture(): { mesh: Node3D; scene: Scene3D; texture: Texture } {
  const texture = createTexture({ resource: pendingRef() });
  const material = createStandardPbrMaterial({ baseColorMap: texture });
  const mesh = createMesh(createBoxMeshGeometry(), [material]);
  const scene = createScene3D();
  addNodeChild(scene.root, mesh);
  return { mesh, scene, texture };
}

describe('revealScene3DResourcesOnResolve', () => {
  it('hides every object carrying a pending texture to the start opacity up front', () => {
    const { mesh, scene } = sceneWithPendingTexture();
    const resolver = createBuiltInScene3DResourceResolver();
    revealScene3DResourcesOnResolve(resolver, scene.root, createTweenManager());
    expect(mesh.alpha).toBe(0);
  });

  it('honors a custom from opacity', () => {
    const { mesh, scene } = sceneWithPendingTexture();
    const resolver = createBuiltInScene3DResourceResolver();
    revealScene3DResourcesOnResolve(resolver, scene.root, createTweenManager(), { from: 0.2 });
    expect(mesh.alpha).toBeCloseTo(0.2);
  });

  it('fades the owning object to full opacity as its texture resolves', () => {
    const { mesh, scene, texture } = sceneWithPendingTexture();
    const resolver = createBuiltInScene3DResourceResolver();
    const manager = createTweenManager();
    revealScene3DResourcesOnResolve(resolver, scene.root, manager, { fadeSeconds: 0.5 });
    expect(mesh.alpha).toBe(0);

    const signals = enableScene3DResourceSignals(resolver);
    const event: Scene3DResourceEvent = { ref: texture.resource!, texture };
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
    const scene = createScene3D();
    addNodeChild(scene.root, mesh);
    const resolver = createBuiltInScene3DResourceResolver();
    const manager = createTweenManager();
    revealScene3DResourcesOnResolve(resolver, scene.root, manager, { fadeSeconds: 0.5 });

    const signals = enableScene3DResourceSignals(resolver);
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
    const scene = createScene3D();
    addNodeChild(scene.root, mesh);
    const resolver = createBuiltInScene3DResourceResolver();
    const manager = createTweenManager();
    revealScene3DResourcesOnResolve(resolver, scene.root, manager, { fadeSeconds: 0.5 });

    const signals = enableScene3DResourceSignals(resolver);
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
    const scene = createScene3D();
    addNodeChild(scene.root, mesh);

    revealScene3DResourcesOnResolve(createBuiltInScene3DResourceResolver(), scene.root, createTweenManager());
    expect(mesh.alpha).toBe(1);
  });

  it('reveals every owner of one shared texture when that texture settles', () => {
    const texture = createTexture({ resource: pendingRef() });
    const a = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial({ baseColorMap: texture })]);
    const b = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial({ baseColorMap: texture })]);
    const scene = createScene3D();
    addNodeChild(scene.root, a);
    addNodeChild(scene.root, b);
    const resolver = createBuiltInScene3DResourceResolver();
    const manager = createTweenManager();
    revealScene3DResourcesOnResolve(resolver, scene.root, manager);

    emitSignal(enableScene3DResourceSignals(resolver).onResourceResolved, { ref: texture.resource!, texture });
    expect(hasTweensOf(manager, a)).toBe(true);
    expect(hasTweensOf(manager, b)).toBe(true);
  });

  it('ignores a resolve event for a texture it is not tracking', () => {
    const { scene } = sceneWithPendingTexture();
    const resolver = createBuiltInScene3DResourceResolver();
    const manager = createTweenManager();
    revealScene3DResourcesOnResolve(resolver, scene.root, manager, { fadeSeconds: 0.5 });

    const stray = createTexture({ resource: pendingRef() });
    emitSignal(enableScene3DResourceSignals(resolver).onResourceResolved, { ref: stray.resource!, texture: stray });
    expect(hasTweensOf(manager, stray as unknown as object)).toBe(false);
  });

  it('disconnects the listener when the returned disposer runs', () => {
    const { mesh, scene, texture } = sceneWithPendingTexture();
    const resolver = createBuiltInScene3DResourceResolver();
    const manager = createTweenManager();
    const dispose = revealScene3DResourcesOnResolve(resolver, scene.root, manager, { fadeSeconds: 0.5 });
    dispose();

    emitSignal(enableScene3DResourceSignals(resolver).onResourceResolved, { ref: texture.resource!, texture });
    expect(hasTweensOf(manager, mesh)).toBe(false);
  });
});
