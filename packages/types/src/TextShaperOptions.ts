import type { FontVariation } from './FontVariation';
import type { TextDirectionKind } from './TextDirectionKind';
import type { TextFeature } from './TextFeature';
export interface TextShaperOptions {
  readonly direction?: TextDirectionKind;
  readonly features?: readonly TextFeature[];
  readonly language?: string;
  readonly script?: string;
  readonly variations?: readonly FontVariation[];
}
