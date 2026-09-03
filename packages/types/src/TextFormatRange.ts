import type { Entity } from './Entity';
import type { TextFormat } from './TextFormat';

export interface TextFormatRange extends Entity {
  end: number;
  format: TextFormat;
  start: number;
}
