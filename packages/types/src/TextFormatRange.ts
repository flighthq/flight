import type { TextFormat } from './TextFormat';

export interface TextFormatRange {
  end: number;
  format: TextFormat;
  start: number;
}
