import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { getTextureViewSize } from '@flighthq/texture/contract';
import type {
  BoundsNode,
  EntityConstruction,
  MethodsOf,
  Node2DFields,
  Rectangle,
  NodeAny,
  RendererData,
  RenderState,
  Sprite,
  SpriteData,
  SpriteIdentityRendererData,
  SpriteRuntime,
} from '@flighthq/types/contract';
import { SpriteKind } from '@flighthq/types/contract';

import { createNode2D, createNode2DRuntime, getNode2DRuntime } from './displayObject.ts';

export function cloneSprite(source: Readonly<Sprite>): Sprite {
  return ((created) => {
    Object.assign(created.data, { texture: source.data.texture });
    return created;
  })(createSprite());
}

export function computeSpriteLocalBoundsRectangle(out: Rectangle, source: Readonly<BoundsNode<Node2DFields>>): void {
  const sprite = source as Readonly<Sprite>;
  const texture = sprite.data.texture;
  if (texture === null) {
    out.width = 0;
    out.height = 0;
  } else {
    getTextureViewSize(spriteViewSize, texture);
    out.width = spriteViewSize.x;
    out.height = spriteViewSize.y;
  }
  const runtime = getNode2DRuntime(sprite) as SpriteRuntime;
  runtime.localBoundsTexture = texture;
  runtime.localBoundsTextureVersion = texture?.version ?? -1;
}

export function createSprite(): Sprite {
  return createNode2D(SpriteKind, createSpriteData, createSpriteRuntime) as Sprite;
}

export function createSpriteData(): SpriteData {
  const out = allocateEntity<SpriteData>();
  initializeSpriteData(out);
  return finishEntity(out);
}

export function createSpriteRendererData(_state: RenderState, source: NodeAny): SpriteIdentityRendererData {
  const out = allocateEntity<SpriteIdentityRendererData>();
  initializeSpriteRendererData(out, _state, source);
  return finishEntity(out);
}

export function createSpriteRuntime(): SpriteRuntime {
  const runtime = createNode2DRuntime(defaultMethods) as SpriteRuntime;
  runtime.localBoundsTexture = null;
  runtime.localBoundsTextureVersion = -1;
  return runtime;
}

export function getSpriteRuntime(source: Readonly<Sprite>): Readonly<SpriteRuntime> {
  return getNode2DRuntime(source) as SpriteRuntime;
}

export function initializeSpriteData(out: EntityConstruction<SpriteData>): void {
  out.texture = null;
}

// Creates the per-state identity stamp used by a Sprite renderer's optional dirty hook. The data is
// attached to that state's render proxy, so separate render pipelines compare independently.
export function initializeSpriteRendererData(
  out: EntityConstruction<SpriteIdentityRendererData>,
  _state: RenderState,
  source: NodeAny,
): void {
  const texture = (source as Sprite).data.texture;
  out.textureIdentity = texture;
  out.textureVersion = texture?.version ?? -1;
}

// Detects Texture identity/version changes before requiresInvalidation can skip a Sprite. Each
// backend opts into this through its registered renderer; the generic walk never knows SpriteKind.
export function isSpriteRendererDirty(
  _state: RenderState,
  source: NodeAny,
  rendererData: RendererData | null,
): boolean {
  if (rendererData === null) return false;
  const data = rendererData as SpriteIdentityRendererData;
  const texture = (source as Sprite).data.texture;
  const version = texture?.version ?? -1;
  const dirty = data.textureIdentity !== texture || data.textureVersion !== version;
  data.textureIdentity = texture;
  data.textureVersion = version;
  return dirty;
}

function isSpriteLocalBoundsRectangleValid(source: Readonly<BoundsNode<Node2DFields>>): boolean {
  const sprite = source as Readonly<Sprite>;
  const runtime = getNode2DRuntime(sprite) as SpriteRuntime;
  const texture = sprite.data.texture;
  return runtime.localBoundsTexture === texture && runtime.localBoundsTextureVersion === (texture?.version ?? -1);
}

const defaultMethods: Partial<MethodsOf<SpriteRuntime> & Pick<SpriteRuntime, 'isLocalBoundsRectangleValid'>> = {
  computeLocalBoundsRectangle: computeSpriteLocalBoundsRectangle,
  isLocalBoundsRectangleValid: isSpriteLocalBoundsRectangleValid,
};

const spriteViewSize = { x: 0, y: 0 };
