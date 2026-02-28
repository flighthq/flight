import type { Timeline } from '@flighthq/types';

export function createTimeline(obj: Partial<Timeline> = {}): Timeline {
  if (obj.frameRate === undefined) obj.frameRate = null;
  if (obj.scenes === undefined) obj.scenes = [];
  if (obj.scripts === undefined) obj.scripts = [];
  return obj as Timeline;
}
