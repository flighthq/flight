import { Entity, attachEntityWrapper, getEntityWrapperAs } from '@flighthq/entity/contract';

import type { TextFormat } from './textFormat.ts';
import { createTextFormatRange } from './textFormatRangeRaw.ts';
import type { TextFormatRangeRaw } from './textFormatRangeRaw.ts';

export class TextFormatRange extends Entity {
  declare readonly raw: TextFormatRangeRaw;

  get format(): TextFormat {
    return this.raw.format;
  }

  set format(value: TextFormat) {
    this.raw.format = value;
  }

  get start(): number {
    return this.raw.start;
  }

  set start(value: number) {
    this.raw.start = value;
  }

  get end(): number {
    return this.raw.end;
  }

  set end(value: number) {
    this.raw.end = value;
  }

  constructor();
  constructor(format: TextFormat, start: number, end: number);
  constructor(format: TextFormat = {}, start = 0, end = start) {
    super(createTextFormatRange(format, start, end));
  }

  static override create(): TextFormatRange;
  static override create(format: TextFormat, start: number, end: number): TextFormatRange;
  static override create(format: TextFormat = {}, start = 0, end = start): TextFormatRange {
    return new TextFormatRange(format, start, end);
  }

  static override from(raw: TextFormatRangeRaw): TextFormatRange {
    const existing = getEntityWrapperAs<Entity>(raw);
    if (existing !== null) {
      if (existing instanceof TextFormatRange) return existing;
      throw new TypeError('TextFormatRangeRaw is already attached to an incompatible OOP wrapper');
    }

    // The public constructor owns raw allocation, so conversion forms the target-native wrapper
    // directly and performs the same explicit attachment as the Entity constructor.
    const wrapper = Object.create(TextFormatRange.prototype) as TextFormatRange;
    Object.assign(wrapper, { raw });
    attachEntityWrapper(raw, wrapper);
    return wrapper;
  }
}
