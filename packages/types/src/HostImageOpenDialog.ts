import type { ImageOpenDialogResult, OpenImageDialogOptions } from './Dialog.ts';

export interface HostImageOpenDialogCapability {
  open(options?: Readonly<OpenImageDialogOptions>): Promise<ImageOpenDialogResult>;
}
