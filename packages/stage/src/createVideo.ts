import type { PartialWithData, Video, VideoData } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';

export function createVideo(obj: PartialWithData<Video> = {}): Video {
  if (obj.data === undefined) obj.data = {} as VideoData;
  if (obj.data.smoothing === undefined) obj.data.smoothing = true;
  if (obj.type === undefined) obj.type = 'video';
  return createDisplayObject(obj) as Video;
}
