import type {
  RichText as RichTextOwned,
  RichTextData as RichTextDataOwned,
  RichTextRuntime as RichTextRuntimeOwned,
} from '@flighthq/text/contract';
import { expect, expectTypeOf, it } from 'vitest';

import type { RichText, RichTextData, RichTextRuntime } from './RichText.ts';
import { RichTextKind } from './RichText.ts';

it('aliases the canonical Text contracts without retaining a second shape', () => {
  expectTypeOf<RichText>().toEqualTypeOf<RichTextOwned>();
  expectTypeOf<RichTextData>().toEqualTypeOf<RichTextDataOwned>();
  expectTypeOf<RichTextRuntime>().toEqualTypeOf<RichTextRuntimeOwned>();
  expectTypeOf<RichText['data']>().toEqualTypeOf<RichTextDataOwned>();
  expectTypeOf<RichTextRuntime['richTextContent']>().toEqualTypeOf<RichTextRuntimeOwned['richTextContent']>();
  expectTypeOf(RichTextKind).toEqualTypeOf<'RichText'>();
  expect(RichTextKind).toBe('RichText');
});
