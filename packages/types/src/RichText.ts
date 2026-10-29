import type {
  RichText as RichTextOwned,
  RichTextData as RichTextDataOwned,
  RichTextRuntime as RichTextRuntimeOwned,
} from '@flighthq/text/contract';

/** @deprecated Import `RichTextData` from `@flighthq/text/contract`. */
export type RichTextData = RichTextDataOwned;

/** @deprecated Import `RichTextRuntime` from `@flighthq/text/contract`. */
export type RichTextRuntime = RichTextRuntimeOwned;

/** @deprecated Import `RichText` from `@flighthq/text/contract`. */
export type RichText = RichTextOwned;

/** @deprecated Import `RichTextKind` from `@flighthq/text/contract`. */
export const RichTextKind = 'RichText' as const;
