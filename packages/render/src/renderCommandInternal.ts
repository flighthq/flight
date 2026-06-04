import type { RenderCommand, RenderCommandPool } from '@flighthq/types';

export interface RenderCommandInternal extends RenderCommand {
  poolNext: RenderCommandInternal | null;
}

export interface RenderCommandPoolInternal extends RenderCommandPool {
  readonly commands: RenderCommandInternal[];
  freeHead: RenderCommandInternal | null;
}
