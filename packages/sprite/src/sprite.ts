import {
  createDisplayObjectGeneric,
  createDisplayObjectRuntime,
  getDisplayObjectRuntime,
} from '@flighthq/displayobject';
import { createSignal } from '@flighthq/signals';
import type {
  MethodsOf,
  Node,
  PartialNode,
  Rectangle,
  Sprite,
  SpriteData,
  SpriteRuntime,
  SpriteSignals,
  TextureAtlasRegion,
  Vector2,
} from '@flighthq/types';
import { SpriteKind } from '@flighthq/types';

/**
 * Deep-copies `source` into a new `Sprite` with a fresh runtime and the same `data` fields.
 * The `atlas` and `rect` references are shared (not deep-copied); `id` is copied by value.
 */
export function cloneSprite(source: Readonly<Sprite>): Sprite {
  const src = source.data;
  return createSprite({
    data: {
      atlas: src.atlas,
      id: src.id,
      rect: src.rect,
    },
  });
}

/**
 * Computes local bounds for the sprite. Honors region `pivotX`/`pivotY` by offsetting `out.x`/`out.y`
 * so the pivot-anchored origin is at (0, 0). When `data.rect` is set it is used directly (no pivot
 * offset, since a manual rect already describes the desired origin).
 */
export function computeSpriteLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
  const data = (source as Sprite).data;
  if (data.rect !== null) {
    out.width = data.rect.width;
    out.height = data.rect.height;
    return;
  }
  if (data.atlas !== null) {
    const region = data.atlas.regions.find((r) => r.id === data.id);
    if (region !== undefined) {
      const pivotX = region.pivotX ?? 0;
      const pivotY = region.pivotY ?? 0;
      out.x = pivotX === 0 ? 0 : -pivotX;
      out.y = pivotY === 0 ? 0 : -pivotY;
      out.width = region.width;
      out.height = region.height;
    }
  }
}

export function createSprite(obj?: Readonly<PartialNode<Sprite>>): Sprite {
  return createDisplayObjectGeneric(SpriteKind, obj, createSpriteData, createSpriteRuntime) as Sprite;
}

export function createSpriteData(data?: Readonly<Partial<SpriteData>>): SpriteData {
  return {
    atlas: data?.atlas ?? null,
    id: data?.id ?? 0,
    rect: data?.rect ?? null,
  };
}

export function createSpriteRuntime(): SpriteRuntime {
  return createDisplayObjectRuntime(defaultMethods) as SpriteRuntime;
}

export function createSpriteSignals(): SpriteSignals {
  return {
    onFrameChanged: createSignal(),
  };
}

/**
 * Opt-in signals for a `Sprite` node. Returns the {@link SpriteSignals} group attached to
 * `target`, creating it on the first call. Zero cost until enabled — honors the `enable*` convention.
 * Use `getSpriteSignals` to read without creating.
 */
export function enableSpriteSignals(target: Sprite): SpriteSignals {
  const s = target as SpriteWithSignals;
  return (s[spriteSignalsSlot] ??= createSpriteSignals());
}

/**
 * Returns the pivot-anchored origin point for the sprite.
 * When the sprite references an atlas region with a pivot, `out` is the negative of the
 * pivot (i.e., the local-space coordinate that maps to the pivot). Returns `(0, 0)` when
 * no atlas or region is found, or when the region has no pivot.
 */
export function getSpriteOrigin(out: Vector2, source: Readonly<Sprite>): void {
  const region = getSpriteRegion(source);
  const pivotX = region !== null ? (region.pivotX ?? 0) : 0;
  const pivotY = region !== null ? (region.pivotY ?? 0) : 0;
  out.x = pivotX === 0 ? 0 : -pivotX;
  out.y = pivotY === 0 ? 0 : -pivotY;
}

/**
 * Returns the `TextureAtlasRegion` matching `source.data.id` in the sprite's atlas,
 * or `null` when no atlas is set or no region matches.
 */
export function getSpriteRegion(source: Readonly<Sprite>): TextureAtlasRegion | null {
  const { atlas, id } = source.data;
  if (atlas === null) return null;
  return atlas.regions.find((r) => r.id === id) ?? null;
}

export function getSpriteRuntime(source: Readonly<Sprite>): Readonly<SpriteRuntime> {
  return getDisplayObjectRuntime(source) as SpriteRuntime;
}

/** Returns the {@link SpriteSignals} attached to `source`, or `null` if not yet enabled. */
export function getSpriteSignals(source: Readonly<Sprite>): SpriteSignals | null {
  return (source as SpriteWithSignals)[spriteSignalsSlot] ?? null;
}

/** Sets `target.data.id`, selecting the atlas region to render. Fires `onFrameChanged` when signals are enabled. */
export function setSpriteFrame(target: Sprite, id: number): void {
  target.data.id = id;
  const signals = getSpriteSignals(target);
  if (signals !== null) signals.onFrameChanged.emit(id);
}

/** Sets `target.data.rect`, overriding atlas region bounds with an explicit rectangle. Pass `null` to clear. */
export function setSpriteFrameRect(target: Sprite, rect: Readonly<Rectangle> | null): void {
  target.data.rect = rect as Rectangle | null;
}

const defaultMethods: Partial<MethodsOf<SpriteRuntime>> = {
  computeLocalBoundsRectangle: computeSpriteLocalBoundsRectangle,
};

const spriteSignalsSlot = Symbol('spriteSignals');

interface SpriteWithSignals {
  [spriteSignalsSlot]?: SpriteSignals;
}
