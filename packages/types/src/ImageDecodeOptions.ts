// Options for an ImageDecoder. premultiplyAlpha requests premultiplied RGBA output: a decoder able to
// premultiply in one pass (e.g. createImageBitmap({ premultiplyAlpha: 'premultiply' })) should do so,
// otherwise the caller premultiplies the straight result. Straight alpha is the default when omitted.
export interface ImageDecodeOptions {
  premultiplyAlpha?: boolean;
}
