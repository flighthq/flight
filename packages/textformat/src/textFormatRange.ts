import { Entity, getEntityWrapperAs } from '@flighthq/entity/contract';

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

    // Calling the Entity constructor with this class as newTarget attaches the same raw object
    // without running the public field-based constructor and allocating a replacement raw.
    return Reflect.construct(Entity, [raw], TextFormatRange) as TextFormatRange;
  }
}
