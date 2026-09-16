import type { PromptDialogOptions } from './Dialog';
import type { Entity } from './Entity';

export interface HostPromptDialogCapability extends Entity {
  prompt(options: Readonly<PromptDialogOptions>): Promise<string | null>;
}
