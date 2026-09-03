import type { Entity } from './Entity';

export interface FontResource extends Entity {
  family: string;
  face: FontFace | null;
}

export interface FontUrl {
  format?: string;
  url: string;
}
