import type { EntityRaw } from '@flighthq/entity/contract';
import { Entity, getEntityWrapperAs } from '@flighthq/entity/contract';

import { lerpLinearColor } from './lerpColor.ts';
import type { LinearColorRaw } from './packColor.ts';
import { allocateLinearColor, packLinearToColor, unpackColorToLinear } from './packColor.ts';

export class LinearColor extends Entity {
  declare readonly raw: LinearColorRaw;

  constructor(raw: LinearColorRaw = allocateLinearColor()) {
    super(raw);
  }

  static override create(): LinearColor {
    return new LinearColor();
  }

  static override from(raw: EntityRaw): LinearColor {
    const wrapper = getEntityWrapperAs<Entity>(raw);
    if (wrapper === null) return new LinearColor(raw as LinearColorRaw);
    if (wrapper instanceof LinearColor) return wrapper;
    throw new TypeError('Cannot create LinearColor: the EntityRaw object already has a different wrapper');
  }

  get r(): number {
    return this.raw.r;
  }

  set r(value: number) {
    this.raw.r = value;
  }

  get g(): number {
    return this.raw.g;
  }

  set g(value: number) {
    this.raw.g = value;
  }

  get b(): number {
    return this.raw.b;
  }

  set b(value: number) {
    this.raw.b = value;
  }

  get a(): number {
    return this.raw.a;
  }

  set a(value: number) {
    this.raw.a = value;
  }

  packToColor(): number {
    return packLinearToColor(this.raw);
  }

  unpackColor(color: number): void {
    unpackColorToLinear(this.raw, color);
  }

  lerp(start: LinearColor, end: LinearColor, t: number): void {
    lerpLinearColor(this.raw, start.raw, end.raw, t);
  }
}
