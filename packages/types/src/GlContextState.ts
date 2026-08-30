import type { Entity } from './Entity';
import type { GlContext } from './GlContext';

export interface GlContextState extends Entity {
  readonly gl: GlContext;
}
