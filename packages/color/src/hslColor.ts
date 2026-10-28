import type { EntityRaw } from '@flighthq/entity/contract';
import { Entity, getEntityWrapperAs } from '@flighthq/entity/contract';

import type { HslColorRaw } from './hslColorRaw.ts';
import { allocateHslColor, rgbToHsl } from './hslColorRaw.ts';

export class HslColor extends Entity {
  declare readonly raw: HslColorRaw;

  constructor(raw: HslColorRaw = allocateHslColor()) {
    super(raw);
  }

  static override create(): HslColor {
    return new HslColor();
  }

  static override from(raw: EntityRaw): HslColor {
    const wrapper = getEntityWrapperAs<Entity>(raw);
    if (wrapper === null) return new HslColor(raw as HslColorRaw);
    if (wrapper instanceof HslColor) return wrapper;
    throw new TypeError('Cannot create HslColor: the EntityRaw object already has a different wrapper');
  }

  get h(): number {
    return this.raw.h;
  }

  set h(value: number) {
    this.raw.h = value;
  }

  get s(): number {
    return this.raw.s;
  }

  set s(value: number) {
    this.raw.s = value;
  }

  get l(): number {
    return this.raw.l;
  }

  set l(value: number) {
    this.raw.l = value;
  }

  rgbToHsl(color: number): void {
    rgbToHsl(this.raw, color);
  }
}
