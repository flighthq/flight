import type { Entity } from './Entity.ts';
import type { TextFormat } from './TextFormat.ts';

export interface TextFormatRange extends Entity {
  end: number;
  format: TextFormat;
  start: number;
}
