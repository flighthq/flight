// Raw decoded image: straight (non-premultiplied) RGBA8 pixels plus dimensions. The output of an
// ImageDecoder and the input to an ImageEncoder. `data` is row-major, 4 bytes per pixel, width*height*4
// bytes long, matching @flighthq/bitmap. Canvas adapters expose the same storage through a zero-copy
// Uint8ClampedArray view at the ImageData boundary. decodeImagePremultiplied returns the premultiplied
// variant of this same shape.
export interface DecodedImage {
  data: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
}
