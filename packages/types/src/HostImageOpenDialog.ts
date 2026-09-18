import type { ImageOpenDialogResult, OpenImageDialogOptions } from './Dialog';

export interface HostImageOpenDialogCapability {
  open(options?: Readonly<OpenImageDialogOptions>): Promise<ImageOpenDialogResult>;
}
