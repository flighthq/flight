import type { Node2D, Node2DData, Node2DRuntime } from './Node2D';
import type { VideoResource } from './VideoResource';

export interface VideoData extends Node2DData {
  smoothing: boolean;
  source: VideoResource | null;
}

export interface VideoRuntime extends Node2DRuntime {}

export interface Video extends Node2D {
  data: VideoData;
}

export const VideoKind = 'Video';
