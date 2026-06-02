import type { Entity } from './Entity';

export interface PresentationRenderable extends Entity {
  kind: symbol;
}
