import type { Entity } from './Entity.ts';
import type { GlContext } from './GlContext.ts';

export interface GlContextState extends Entity {
  readonly gl: GlContext;
}
