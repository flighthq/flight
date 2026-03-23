import { ColorTransform } from '@flighthq/flight/materials';
import { getBoundsRect, getParent, invalidateAppearance, invalidateLocalTransform } from '@flighthq/scene-graph-core';
import type { BlendMode, Shader, SpriteNode as RawSpriteNode } from '@flighthq/types';

import FlightObject from '../../../FlightObject';
import type Sprite from './Sprite';

export default class SpriteNode extends FlightObject<RawSpriteNode> {
  protected constructor() {
    super();
  }

  // Get & Set Methods

  get alpha(): number {
    return this.__raw.alpha;
  }

  set alpha(value: number) {
    if (value > 1.0) value = 1.0;
    if (value < 0.0) value = 0.0;
    if (value === this.__raw.alpha) return;
    this.__raw.alpha = value;
    invalidateAppearance(this.__raw);
  }

  get alphaEnabled(): boolean {
    return this.__raw.alphaEnabled;
  }

  set alphaEnabled(value: boolean) {
    this.__raw.alphaEnabled = value;
  }

  get blendMode(): BlendMode | null {
    return this.__raw.blendMode;
  }

  set blendMode(value: BlendMode | null) {
    if (value === this.__raw.blendMode) return;
    this.__raw.blendMode = value;
    invalidateAppearance(this.__raw);
  }

  get blendModeEnabled(): boolean {
    return this.__raw.blendModeEnabled;
  }

  set blendModeEnabled(value: boolean) {
    this.__raw.blendModeEnabled = value;
  }

  get colorTransform(): ColorTransform | null {
    return FlightObject.getOrCreate(this.__raw.colorTransform, ColorTransform);
  }

  set colorTransform(value: ColorTransform | null) {
    this.__raw.colorTransform = value !== null ? value.raw : null;
  }

  get colorTransformEnabled(): boolean {
    return this.__raw.colorTransformEnabled;
  }

  set colorTransformEnabled(value: boolean) {
    this.__raw.colorTransformEnabled = value;
  }

  get height(): number {
    return getBoundsRect(this.__raw).height;
  }

  set height(value: number) {
    const localBounds = getBoundsRect(this.__raw);
    if (localBounds.height === 0) return;
    // Invalidation (if necessary) occurs in scaleY setter
    this.scaleY = value / localBounds.height;
  }

  get name(): string | null {
    return this.__raw.name;
  }

  set name(value: string | null) {
    this.__raw.name = value;
  }

  get parent(): Sprite | null {
    return FlightObject.get(getParent(this.__raw)) as unknown as Sprite;
  }

  get rotation(): number {
    return this.__raw.rotation;
  }

  set rotation(value: number) {
    if (value === this.__raw.rotation) return;
    // Normalize from -180 to 180
    value = value % 360.0;
    if (value > 180.0) {
      value -= 360.0;
    } else if (value < -180.0) {
      value += 360.0;
    }
    this.__raw.rotation = value;
    invalidateLocalTransform(this.__raw);
  }

  get scaleX(): number {
    return this.__raw.scaleX;
  }

  set scaleX(value: number) {
    if (value === this.__raw.scaleX) return;
    this.__raw.scaleX = value;
    invalidateLocalTransform(this.__raw);
  }

  get scaleY(): number {
    return this.__raw.scaleY;
  }

  set scaleY(value: number) {
    if (value === this.__raw.scaleY) return;
    this.__raw.scaleY = value;
    invalidateLocalTransform(this.__raw);
  }

  get shader(): Shader | null {
    return this.__raw.shader;
  }

  set shader(value: Shader | null) {
    if (value === this.__raw.shader) return;
    this.__raw.shader = value;
    invalidateAppearance(this.__raw);
  }

  get visible(): boolean {
    return this.__raw.visible;
  }

  set visible(value: boolean) {
    if (value === this.__raw.visible) return;
    this.__raw.visible = value;
    invalidateAppearance(this.__raw);
  }

  get width(): number {
    return getBoundsRect(this.__raw).width;
  }

  set width(value: number) {
    const localBounds = getBoundsRect(this.__raw);
    if (localBounds.width === 0) return;
    // Invalidation (if necessary) occurs in scaleX setter
    this.scaleX = value / localBounds.width;
  }

  get x(): number {
    return this.__raw.x;
  }

  set x(value: number) {
    if (value !== value) value = 0; // convert NaN to 0
    if (value === this.__raw.x) return;
    this.__raw.x = value;
    invalidateLocalTransform(this.__raw);
  }

  get y(): number {
    return this.__raw.y;
  }

  set y(value: number) {
    if (value !== value) value = 0; // convert NaN to 0
    if (value === this.__raw.y) return;
    this.__raw.y = value;
    invalidateLocalTransform(this.__raw);
  }
}
