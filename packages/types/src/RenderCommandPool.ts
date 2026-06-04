import type { RenderCommand } from './RenderCommand';

export interface RenderCommandPool {
  readonly commands: RenderCommand[];
  commandCount: number;
}
