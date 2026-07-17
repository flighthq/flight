import { forEachNodeDescendant } from '@flighthq/node';
import { isMesh } from '@flighthq/scene';
import { connectSignal, disconnectSignal } from '@flighthq/signals';
import { createTween } from '@flighthq/tween';
import type { EasingFunction, Material, SceneNode, Texture, TweenManager } from '@flighthq/types';

import { getSceneMaterialTextures } from './sceneMaterialTextureRegistry';
import type { SceneResourceResolver } from './sceneResourceResolver';
import { enableSceneResourceSignals } from './sceneResourceSignals';

export interface SceneResourceRevealOptions {
  // The timing curve of the fade (an @flighthq/easing function). Omit for the tween's default (linear).
  ease?: EasingFunction;
  // The fade duration in seconds. Default 0.4.
  fadeSeconds?: number;
  // The starting opacity an object is hidden to before its texture resolves. Default 0 (invisible).
  from?: number;
}

// The standard streamed-texture fade-in, composed from node opacity (P1/P2) + @flighthq/tween: every
// object carrying a still-pending texture is hidden to `from` up front, and when a texture resolves
// the resolver's onResourceResolved signal fades its owning object's `node.alpha` up to 1 over
// `fadeSeconds`. The resolver only reports availability; this recipe animates — the app ticks the fade
// via updateTweens(tweenManager, dt), and a node-opacity-honoring renderer (scene-gl) makes it visible.
//
// Call BEFORE resolveSceneResources so objects start hidden rather than popping. Returns a disposer
// that disconnects the signal listener (the tween manager and any in-flight tweens are the caller's).
// A texture shared across meshes fades every owning object; an object with several pending textures
// fades in when the first of them resolves.
export function revealSceneResourcesOnResolve(
  resolver: SceneResourceResolver,
  scene: Readonly<SceneNode>,
  tweenManager: TweenManager,
  options?: Readonly<SceneResourceRevealOptions>,
): () => void {
  const fadeSeconds = options?.fadeSeconds ?? 0.4;
  const from = options?.from ?? 0;
  const tweenOptions = options?.ease !== undefined ? { ease: options.ease } : undefined;

  const owners = new Map<Texture, SceneNode[]>();
  collectPendingTextureOwners(scene, resolver, owners);
  for (const nodes of owners.values()) {
    for (const node of nodes) node.alpha = from;
  }

  const signals = enableSceneResourceSignals(resolver);
  const slot = (event: Readonly<{ texture: Texture }>): void => {
    const nodes = owners.get(event.texture);
    if (nodes === undefined) return;
    for (const node of nodes) createTween(tweenManager, node, fadeSeconds, { alpha: 1 }, tweenOptions);
  };
  connectSignal(signals.onResourceResolved, slot);
  return () => disconnectSignal(signals.onResourceResolved, slot);
}

// Maps each still-pending texture (resource != null) to the Mesh nodes that carry it, so a resolved
// texture's event resolves back to the object(s) to fade. Mirrors getSceneResourceTextures' walk but
// keeps the owning node instead of deduping textures to a flat list.
function collectPendingTextureOwners(
  scene: Readonly<SceneNode>,
  resolver: Readonly<SceneResourceResolver>,
  out: Map<Texture, SceneNode[]>,
): void {
  const slots: Texture[] = [];
  const visit = (node: Readonly<SceneNode>): void => {
    if (!isMesh(node)) return;
    const owner = node as SceneNode;
    const materials = node.materials;
    for (let i = 0; i < materials.length; i++) {
      const material = materials[i] as Material | null;
      if (material === null) continue;
      slots.length = 0;
      getSceneMaterialTextures(resolver.registry, material, slots);
      for (let j = 0; j < slots.length; j++) {
        const texture = slots[j];
        if (texture.resource == null) continue;
        let nodes = out.get(texture);
        if (nodes === undefined) {
          nodes = [];
          out.set(texture, nodes);
        }
        if (!nodes.includes(owner)) nodes.push(owner);
      }
    }
  };
  visit(scene);
  forEachNodeDescendant(scene, (node) => visit(node as Readonly<SceneNode>));
}
