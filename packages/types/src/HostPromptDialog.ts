import type { PromptDialogOptions } from './Dialog.ts';

export interface HostPromptDialogCapability {
  prompt(options: Readonly<PromptDialogOptions>): Promise<string | null>;
}
