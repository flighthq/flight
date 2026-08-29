import type { PromptDialogOptions } from './Dialog';

export interface PromptDialogBackend {
  prompt(options: Readonly<PromptDialogOptions>): Promise<string | null>;
}
