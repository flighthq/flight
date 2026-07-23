import { forEachNodeDescendant } from '@flighthq/node';
import { isMesh } from '@flighthq/scene';
import { connectSignal, disconnectSignal } from '@flighthq/signals';
import { createTween } from '@flighthq/tween';
import type {
  Material,
  SceneNode,
  SceneResourceResolver,
  SceneResourceRevealOptions,
  Texture,
  TweenManager,
} from '@flighthq/types';
import { ResourceResolutionState } from '@flighthq/types';

import { getSceneMaterialTextures } from './sceneMaterialTextureRegistry';
import { enableSceneResourceSignals } from './sceneResourceSignals';

// The standard streamed-texture fade-in, composed from node opacity (P1/P2) + @flighthq/tween: every
// object carrying a still-pending texture is hidden to `from` up front, and only after every required
// texture settles does the recipe fade its owning object's `node.alpha` up to 1 over `fadeSeconds`.
// Failure counts as settled so the renderer's fallback can be revealed instead of leaving the object
// permanently hidden. A cancelled load does not settle and remains pending until a later resolution
// pass re-requests it. The resolver only reports availability; this recipe animates — the app ticks
// the fade via updateTweens(tweenManager, dt), and a node-opacity-honoring renderer makes it visible.
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

  const ownersByTexture = new Map<Texture, SceneResourceRevealOwner[]>();
  const owners: SceneResourceRevealOwner[] = [];
  collectPendingTextureOwners(scene, resolver, ownersByTexture, owners);
  for (const owner of owners) {
    owner.node.alpha = from;
  }

  const signals = enableSceneResourceSignals(resolver);
  const slot = (event: Readonly<{ texture: Texture }>): void => {
    const textureOwners = ownersByTexture.get(event.texture);
    if (textureOwners === undefined) return;
    // A resource must emit at most one terminal event for a Texture, but deleting here also makes the
    // reveal atom robust to a caller manually replaying or forwarding the same event.
    ownersByTexture.delete(event.texture);
    for (const owner of textureOwners) {
      owner.pending.delete(event.texture);
      if (owner.pending.size === 0) {
        createTween(tweenManager, owner.node, fadeSeconds, { alpha: 1 }, tweenOptions);
      }
    }
  };
  connectSignal(signals.onResourceResolved, slot);
  connectSignal(signals.onResourceFailed, slot);
  return () => {
    disconnectSignal(signals.onResourceResolved, slot);
    disconnectSignal(signals.onResourceFailed, slot);
  };
}

interface SceneResourceRevealOwner {
  node: SceneNode;
  pending: Set<Texture>;
}

// Maps each unresolved/loading texture to its owning Mesh reveal state. Already bound images and
// previously failed references are settled before this recipe begins, so they must not hide an owner
// waiting for an event that will never arrive. Repeated texture slots on one owner count only once.
function collectPendingTextureOwners(
  scene: Readonly<SceneNode>,
  resolver: Readonly<SceneResourceResolver>,
  ownersByTexture: Map<Texture, SceneResourceRevealOwner[]>,
  owners: SceneResourceRevealOwner[],
): void {
  const slots: Texture[] = [];
  const ownersByNode = new Map<SceneNode, SceneResourceRevealOwner>();
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
        const ref = texture.resource;
        if (ref == null || texture.image !== null || ref.state === ResourceResolutionState.Failed) continue;
        let ownerState = ownersByNode.get(owner);
        if (ownerState === undefined) {
          ownerState = { node: owner, pending: new Set() };
          ownersByNode.set(owner, ownerState);
          owners.push(ownerState);
        }
        if (ownerState.pending.has(texture)) continue;
        ownerState.pending.add(texture);
        let textureOwners = ownersByTexture.get(texture);
        if (textureOwners === undefined) {
          textureOwners = [];
          ownersByTexture.set(texture, textureOwners);
        }
        textureOwners.push(ownerState);
      }
    }
  };
  visit(scene);
  forEachNodeDescendant(scene, (node) => visit(node as Readonly<SceneNode>));
}
