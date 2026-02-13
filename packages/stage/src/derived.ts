import { matrix2D, rectangle } from '@flighthq/math';
import type { DisplayObject, Matrix2D, Rectangle } from '@flighthq/types';
import { DirtyFlags, DisplayObjectDerivedState } from '@flighthq/types';

export function getCurrentBounds(target: DisplayObject): Readonly<Rectangle> {
  updateBounds(target);
  return target[DisplayObjectDerivedState.Key]!.bounds!;
}

export function getCurrentLocalBounds(target: DisplayObject): Readonly<Rectangle> {
  updateLocalBounds(target);
  return target[DisplayObjectDerivedState.Key]!.localBounds!;
}

export function getCurrentLocalTransform(target: DisplayObject): Readonly<Matrix2D> {
  updateLocalTransform(target);
  return target[DisplayObjectDerivedState.Key]!.localTransform!;
}

export function getCurrentWorldBounds(target: DisplayObject): Readonly<Rectangle> {
  updateWorldBounds(target);
  return target[DisplayObjectDerivedState.Key]!.worldBounds!;
}

export function getCurrentWorldTransform(target: DisplayObject): Readonly<Matrix2D> {
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

  if (targetState.bounds === null) targetState.bounds = rectangle.create();
  matrix2D.transformRect(targetState.bounds, targetState.localTransform!, targetState.localBounds!);

  targetState.dirtyFlags &= ~DirtyFlags.TransformedBounds;
}

export function updateLocalBounds(target: DisplayObject): void {
  const targetState = getDerivedState(target);
  if (targetState.localBounds === null) targetState.localBounds = rectangle.create();
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

  if (targetState.localTransform === null) targetState.localTransform = matrix2D.create();
  const matrix = targetState.localTransform;
  matrix.a = targetState.rotationCosine * target.scaleX;
  matrix.b = targetState.rotationSine * target.scaleX;
  matrix.c = -targetState.rotationSine * target.scaleY;
  matrix.d = targetState.rotationCosine * target.scaleY;
  matrix.tx = target.x;
  matrix.ty = target.y;

  targetState.dirtyFlags &= ~DirtyFlags.Transform;
}

export function updateWorldBounds(target: DisplayObject): void {
  updateWorldTransform(target);
  updateLocalBounds(target);

  const targetState = getDerivedState(target);
  if (targetState.worldBounds === null) targetState.worldBounds = rectangle.create();

  // TODO: Cache
  matrix2D.transformRect(targetState.worldBounds, targetState.worldTransform!, targetState.bounds!);
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
  if (targetState.worldTransform === null) targetState.worldTransform = matrix2D.create();

  if (
    targetState.worldTransformID !== targetState.localTransformID ||
    targetState.parentTransformID !== parentTransformID
  ) {
    // Ensure local transform is accurate
    updateLocalTransform(target);
    if (parentState !== null) {
      matrix2D.multiply(targetState.worldTransform, parentState.worldTransform!, targetState.localTransform!);
    } else {
      matrix2D.copy(targetState.worldTransform, targetState.localTransform!);
    }
    targetState.parentTransformID = parentTransformID;
    targetState.worldTransformID = targetState.localTransformID;
  }
}
