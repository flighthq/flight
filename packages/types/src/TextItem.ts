import type { TextDirectionKind } from './TextDirectionKind';
export interface TextItem {
  readonly direction: TextDirectionKind;
  readonly end: number;
  readonly script: string;
  readonly start: number;
}
