import type { Entity } from './Entity';

export interface Font extends Entity {
  name: string;
}

export interface FontUrl {
  format?: string;
  url: string;
}
