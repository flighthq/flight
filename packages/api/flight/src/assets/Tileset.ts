import { createTileset } from '@flighthq/assets';
import type { Tileset as RawTileset } from '@flighthq/types';

import FlightObject from '../FlightObject';
import TextureAtlas from './TextureAtlas';

export default class Tileset extends FlightObject<RawTileset> {
  constructor(atlas?: TextureAtlas, columns?: number, rows?: number, tileWidth?: number, tileHeight?: number) {
    super();
    const raw = this.__raw;
    if (atlas !== undefined) raw.atlas = atlas.raw;
    if (columns !== undefined) raw.columns = columns;
    if (rows !== undefined) raw.rows = rows;
    if (tileWidth !== undefined) raw.tileWidth = tileWidth;
    if (tileHeight !== undefined) raw.tileHeight = tileHeight;
  }

  protected override __create() {
    return createTileset();
  }

  static fromRaw(raw: RawTileset): Tileset {
    return FlightObject.getOrCreate(raw, Tileset)!;
  }

  get atlas(): TextureAtlas | null {
    if (this.__raw.atlas === null) return null;
    return FlightObject.getOrCreate(this.__raw.atlas, TextureAtlas);
  }

  set atlas(value: TextureAtlas | null) {
    this.__raw.atlas = value !== null ? value.raw : value;
  }

  get columns(): number {
    return this.__raw.columns;
  }

  set columns(value: number) {
    this.__raw.columns = value;
  }

  get rows(): number {
    return this.__raw.rows;
  }

  set rows(value: number) {
    this.__raw.rows = value;
  }

  get tileHeight(): number {
    return this.__raw.tileHeight;
  }

  set tileHeight(value: number) {
    this.__raw.tileHeight = value;
  }

  get tileWidth(): number {
    return this.__raw.tileWidth;
  }

  set tileWidth(value: number) {
    this.__raw.tileWidth = value;
  }
}
