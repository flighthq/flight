export type ImageDecodeFailureExplanation =
  | { readonly mimeType: null; readonly reason: 'mime-type-undetected' }
  | { readonly mimeType: string; readonly reason: 'decoder-not-registered' };
