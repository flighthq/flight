import type { Entity } from './Entity';
export interface WebcamRecording extends Entity {
  readonly active: boolean;
  readonly id: string;
  readonly mimeType: string;
  readonly startedAtMs: number;
}
