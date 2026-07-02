import type { FontVariation } from './FontVariation';
import type { TextDirection } from './TextDirection';
import type { TextFeature } from './TextFeature';
export interface TextShaperOptions {
  readonly direction?: TextDirection;
  readonly features?: readonly TextFeature[];
  readonly language?: string;
  readonly script?: string;
  readonly variations?: readonly FontVariation[];
}
