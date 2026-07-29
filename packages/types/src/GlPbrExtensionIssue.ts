import type { Kind } from './Entity';

export type GlPbrExtensionIssueCode =
  | 'duplicate-kind'
  | 'framebuffer-feedback'
  | 'missing-registration'
  | 'texture-unit-exhaustion'
  | 'unsupported-extension';

// Plain-data explanation for a silent Extended PBR skip. Messages live in the opt-in guard module.
export interface GlPbrExtensionIssue {
  code: GlPbrExtensionIssueCode;
  kind: Kind;
}
