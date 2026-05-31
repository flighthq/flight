import type { TimelineLabel } from './TimelineLabel';

export interface Timeline {
  currentFrame: number;
  frameRate: number | null;
  isPlaying: boolean;
  labels: TimelineLabel[];
  lastFrameUpdate: number;
  constructFrame: ((frame: number) => void) | null;
  timeElapsed: number;
  totalFrames: number;
}
