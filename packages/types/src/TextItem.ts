import type { TextDirection } from './TextDirection.ts';
export interface TextItem {
  readonly direction: TextDirection;
  readonly end: number;
  readonly script: string;
  readonly start: number;
}
