import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene } from '@flighthq/scene';
import { emitSignal } from '@flighthq/signals';
import { createTexture } from '@flighthq/texture';
import { createTweenManager, hasTweensOf, updateTweens } from '@flighthq/tween';
import type { EmbeddedImageResourceReference, SceneNode, Texture } from '@flighthq/types';
import { ResourceResolutionState } from '@flighthq/types';

import { revealSceneResourcesOnResolve } from './revealSceneResourcesOnResolve';
import { createSceneResourceResolver } from './sceneResourceResolver';
import type { SceneResourceEvent } from './sceneResourceSignals';
import { enableSceneResourceSignals } from './sceneResourceSignals';

function pendingRef(): EmbeddedImageResourceReference {
  return {
    kind: 'Embedded',
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
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
    const resolver = createSceneResourceResolver();
    revealSceneResourcesOnResolve(resolver, scene.root, createTweenManager());
    expect(mesh.alpha).toBe(0);
  });

  it('honors a custom from opacity', () => {
    const { mesh, scene } = sceneWithPendingTexture();
    const resolver = createSceneResourceResolver();
    revealSceneResourcesOnResolve(resolver, scene.root, createTweenManager(), { from: 0.2 });
    expect(mesh.alpha).toBeCloseTo(0.2);
  });

  it('fades the owning object to full opacity as its texture resolves', () => {
    const { mesh, scene, texture } = sceneWithPendingTexture();
    const resolver = createSceneResourceResolver();
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

  it('ignores a resolve event for a texture it is not tracking', () => {
    const { scene } = sceneWithPendingTexture();
    const resolver = createSceneResourceResolver();
    const manager = createTweenManager();
    revealSceneResourcesOnResolve(resolver, scene.root, manager, { fadeSeconds: 0.5 });

    const stray = createTexture({ resource: pendingRef() });
    emitSignal(enableSceneResourceSignals(resolver).onResourceResolved, { ref: stray.resource!, texture: stray });
    expect(hasTweensOf(manager, stray as unknown as object)).toBe(false);
  });

  it('disconnects the listener when the returned disposer runs', () => {
    const { mesh, scene, texture } = sceneWithPendingTexture();
    const resolver = createSceneResourceResolver();
    const manager = createTweenManager();
    const dispose = revealSceneResourcesOnResolve(resolver, scene.root, manager, { fadeSeconds: 0.5 });
    dispose();

    emitSignal(enableSceneResourceSignals(resolver).onResourceResolved, { ref: texture.resource!, texture });
    expect(hasTweensOf(manager, mesh)).toBe(false);
  });
});
