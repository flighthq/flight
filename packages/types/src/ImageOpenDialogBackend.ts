import type { ImageOpenDialogResult, OpenImageDialogOptions } from './Dialog';
import type { Entity } from './Entity';

export interface HostImageOpenDialogProvider extends Entity {
  open(options?: Readonly<OpenImageDialogOptions>): Promise<ImageOpenDialogResult>;
}
