import type { PromptDialogOptions } from './Dialog';

export interface HostPromptDialogCapability {
  prompt(options: Readonly<PromptDialogOptions>): Promise<string | null>;
}
