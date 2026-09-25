import type { FontVariation } from './FontVariation.ts';
import type { TextDirection } from './TextDirection.ts';
import type { TextFeature } from './TextFeature.ts';
export interface TextShaperOptions {
  readonly direction?: TextDirection;
  readonly features?: readonly TextFeature[];
  readonly language?: string;
  readonly script?: string;
  readonly variations?: readonly FontVariation[];
}
