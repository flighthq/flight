import { forEachNodeDescendant } from '@flighthq/node/contract';
import { isMesh } from '@flighthq/scene3d/contract';
import { connectSignal, disconnectSignal } from '@flighthq/signals/contract';
import { hasTextureSource } from '@flighthq/texture/contract';
import { createTween } from '@flighthq/tween/contract';
import type {
  Material,
  Node3D,
  Scene3D,
  Scene3DResourceResolver,
  Scene3DResourceResolverWithRuntime,
  Scene3DResourceRevealOptions,
  Texture,
  TweenManager,
} from '@flighthq/types/contract';
import { ResourceResolutionState } from '@flighthq/types/contract';

import { getScene3DTextureResourceReference } from './getScene3DResourceTextures';
import { getScene3DMaterialTextures } from './sceneMaterialTextureRegistry';
import { enableScene3DResourceSignals } from './sceneResourceSignals';

// The standard streamed-texture fade-in, composed from node opacity (P1/P2) + @flighthq/tween: every
// object carrying a still-pending texture is hidden to `from` up front, and only after every required
// texture settles does the recipe fade its owning object's `node.alpha` up to 1 over `fadeSeconds`.
// Failure counts as settled so the renderer's fallback can be revealed instead of leaving the object
// permanently hidden. A cancelled load does not settle and remains pending until a later resolution
// pass re-requests it. The resolver only reports availability; this recipe animates — the app ticks
// the fade via updateTweens(tweenManager, dt), and a node-opacity-honoring renderer makes it visible.
//
// Call before loadScene3DResources or updateScene3DResourceStreaming so objects start hidden rather than
// popping. Returns a disposer that disconnects the signal listener (the tween manager and any in-flight
// tweens are the caller's).
// A texture shared across meshes fades every owning object; an object with several pending textures
// fades in when the first of them resolves.
export function revealScene3DResourcesOnResolve(
  resolver: Scene3DResourceResolverWithRuntime,
  scene: Readonly<Scene3D>,
  tweenManager: TweenManager,
  options?: Readonly<Scene3DResourceRevealOptions>,
): () => void {
  const fadeSeconds = options?.fadeSeconds ?? 0.4;
  const from = options?.from ?? 0;
  const tweenOptions = options?.ease !== undefined ? { ease: options.ease } : undefined;

  const ownersByTexture = new Map<Texture, Scene3DResourceRevealOwner[]>();
  const owners: Scene3DResourceRevealOwner[] = [];
  collectPendingTextureOwners(scene, resolver, ownersByTexture, owners);
  for (const owner of owners) {
    owner.node.alpha = from;
  }

  const signals = enableScene3DResourceSignals(resolver);
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

interface Scene3DResourceRevealOwner {
  node: Node3D;
  pending: Set<Texture>;
}

// Maps each unresolved/loading texture to its owning Mesh reveal state. Already bound images and
// previously failed references are settled before this recipe begins, so they must not hide an owner
// waiting for an event that will never arrive. Repeated texture slots on one owner count only once.
function collectPendingTextureOwners(
  scene: Readonly<Scene3D>,
  resolver: Readonly<Scene3DResourceResolver>,
  ownersByTexture: Map<Texture, Scene3DResourceRevealOwner[]>,
  owners: Scene3DResourceRevealOwner[],
): void {
  const slots: Texture[] = [];
  const ownersByNode = new Map<Node3D, Scene3DResourceRevealOwner>();
  const visit = (node: Readonly<Node3D>): void => {
    if (!isMesh(node)) return;
    const owner = node as Node3D;
    const materials = node.materials;
    for (let i = 0; i < materials.length; i++) {
      const material = materials[i] as Material | null;
      if (material === null) continue;
      slots.length = 0;
      getScene3DMaterialTextures(resolver.registry, material, slots);
      for (let j = 0; j < slots.length; j++) {
        const texture = slots[j];
        const ref = getScene3DTextureResourceReference(scene, texture);
        if (ref == null || hasTextureSource(texture) || ref.state === ResourceResolutionState.Failed) continue;
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
  visit(scene.root);
  forEachNodeDescendant(scene.root, (node) => visit(node as Readonly<Node3D>));
}
