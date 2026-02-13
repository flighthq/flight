import { Affine2D, Rectangle } from '@flighthq/math';
import type {
  Affine2D as Affine2DLike,
  DisplayObject,
  Rectangle as RectangleLike} from '@flighthq/types';
import {
  DirtyFlags,
  DisplayObjectDerivedState
} from '@flighthq/types';

function createAffine2D() {
  return new Affine2D();
}

function createRectangle() {
  return new Rectangle();
}

export function getCurrentBounds(target: DisplayObject): Readonly<RectangleLike> {
  updateBounds(target);
  return target[DisplayObjectDerivedState.Key]!.bounds!;
}

export function getCurrentLocalBounds(target: DisplayObject): Readonly<RectangleLike> {
  updateLocalBounds(target);
  return target[DisplayObjectDerivedState.Key]!.localBounds!;
}

export function getCurrentLocalTransform(target: DisplayObject): Readonly<Affine2DLike> {
  updateLocalTransform(target);
  return target[DisplayObjectDerivedState.Key]!.localTransform!;
}

export function getCurrentWorldBounds(target: DisplayObject): Readonly<RectangleLike> {
  updateWorldBounds(target);
  return target[DisplayObjectDerivedState.Key]!.worldBounds!;
}

export function getCurrentWorldTransform(target: DisplayObject): Readonly<Affine2DLike> {
  updateWorldTransform(target);
  return target[DisplayObjectDerivedState.Key]!.worldTransform!;
}

export function getDerivedState(source: DisplayObject): DisplayObjectDerivedState {
  if (source[DisplayObjectDerivedState.Key] === undefined) {
    source[DisplayObjectDerivedState.Key] = {
      bounds: null,
      children: null,
      dirtyFlags: DirtyFlags.None,
      localBounds: null,
      localBoundsID: 0,
      localTransform: null,
      localTransformID: 0,
      parentTransformID: 0,
      rotationAngle: 0,
      rotationCosine: 1,
      rotationSine: 0,
      worldBounds: null,
      worldTransform: null,
      worldTransformID: 0,
    };
  }
  return source[DisplayObjectDerivedState.Key];
}

export function update(target: DisplayObject): void {
  updateBounds(target);
  updateWorldBounds(target);
}

export function updateBounds(target: DisplayObject): void {
  const targetState = getDerivedState(target);
  if (targetState.bounds !== null && (targetState.dirtyFlags & DirtyFlags.TransformedBounds) === 0) return;

  updateLocalBounds(target);
  updateLocalTransform(target);

  if (targetState.bounds === null) targetState.bounds = createRectangle();
  Affine2D.transformRect(targetState.bounds, targetState.localTransform!, targetState.localBounds!);

  targetState.dirtyFlags &= ~DirtyFlags.TransformedBounds;
}

export function updateLocalBounds(target: DisplayObject): void {
  const targetState = getDerivedState(target);
  if (targetState.localBounds === null) targetState.localBounds = createRectangle();
}

export function updateLocalTransform(target: DisplayObject): void {
  const targetState = getDerivedState(target);
  if (targetState.localTransform !== null && (targetState.dirtyFlags & DirtyFlags.Transform) === 0) return;

  if (target.rotation !== targetState.rotationAngle) {
    // Normalize from -180 to 180
    let angle = target.rotation % 360.0;
    if (angle > 180.0) {
      angle -= 360.0;
    } else if (angle < -180.0) {
      angle += 360.0;
    }

    // Use fast cardinal values, or lookup
    const DEG_TO_RAD = Math.PI / 180;
    let sin, cos;
    if (angle === 0) {
      sin = 0;
      cos = 1;
    } else if (angle === 90) {
      sin = 1;
      cos = 0;
    } else if (angle === -90) {
      sin = -1;
      cos = 0;
    } else if (angle === 180 || angle === -180) {
      sin = 0;
      cos = -1;
    } else {
      const rad = angle * DEG_TO_RAD;
      sin = Math.sin(rad);
      cos = Math.cos(rad);
    }

    targetState.rotationAngle = angle;
    targetState.rotationSine = sin;
    targetState.rotationCosine = cos;
  }

  if (targetState.localTransform === null) targetState.localTransform = createAffine2D();
  const matrix = targetState.localTransform;
  const a = targetState.rotationCosine * target.scaleX;
  const b = targetState.rotationSine * target.scaleX;
  const c = -targetState.rotationSine * target.scaleY;
  const d = targetState.rotationCosine * target.scaleY;
  const tx = target.x;
  const ty = target.y;
  matrix.m[0] = a;
  matrix.m[1] = b;
  matrix.m[2] = tx;
  matrix.m[3] = c;
  matrix.m[4] = d;
  matrix.m[5] = ty;

  targetState.dirtyFlags &= ~DirtyFlags.Transform;
}

export function updateWorldBounds(target: DisplayObject): void {
  updateWorldTransform(target);
  updateLocalBounds(target);

  const targetState = getDerivedState(target);
  if (targetState.worldBounds === null) targetState.worldBounds = createRectangle();

  // TODO: Cache
  Affine2D.transformRect(targetState.worldBounds, targetState.worldTransform!, targetState.bounds!);
}

export function updateWorldTransform(target: DisplayObject): void {
  // Recursively allow parents to update if out-of-date
  const parent = target.parent;
  if (parent !== null) {
    updateWorldTransform(parent);
  }
  const parentState = parent !== null ? getDerivedState(parent) : null;
  const parentTransformID = parentState !== null ? parentState.worldTransformID : 0;
  // Update if local transform ID or parent world transform ID changed
  const targetState = getDerivedState(target);
  if (targetState.worldTransform === null) targetState.worldTransform = createAffine2D();

  if (
    targetState.worldTransformID !== targetState.localTransformID ||
    targetState.parentTransformID !== parentTransformID
  ) {
    // Ensure local transform is accurate
    updateLocalTransform(target);
    if (parentState !== null) {
      Affine2D.multiply(targetState.worldTransform, parentState.worldTransform!, targetState.localTransform!);
    } else {
      Affine2D.copy(targetState.worldTransform, targetState.localTransform!);
    }
    targetState.parentTransformID = parentTransformID;
    targetState.worldTransformID = targetState.localTransformID;
  }
}
