import type { Entity } from './Entity';

export interface Font extends Entity {
  name: string;
}

export interface FontURL {
  format?: string;
  url: string;
}
