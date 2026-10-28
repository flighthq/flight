import type { EntityRaw } from '@flighthq/entity/contract';
import { Entity, getEntityWrapperAs } from '@flighthq/entity/contract';

import type { HsvColorRaw } from './hsvColorRaw.ts';
import { allocateHsvColor, rgbToHsv } from './hsvColorRaw.ts';

export class HsvColor extends Entity {
  declare readonly raw: HsvColorRaw;

  constructor(raw: HsvColorRaw = allocateHsvColor()) {
    super(raw);
  }

  static override create(): HsvColor {
    return new HsvColor();
  }

  static override from(raw: EntityRaw): HsvColor {
    return getEntityWrapperAs<HsvColor>(raw) ?? new HsvColor(raw as HsvColorRaw);
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

  get v(): number {
    return this.raw.v;
  }

  set v(value: number) {
    this.raw.v = value;
  }

  rgbToHsv(color: number): void {
    rgbToHsv(this.raw, color);
  }
}
