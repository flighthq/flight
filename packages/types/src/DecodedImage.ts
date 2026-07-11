// Raw decoded image: straight (non-premultiplied) RGBA8 pixels plus dimensions. The output of an
// ImageDecoder and the input to an ImageEncoder. `data` is row-major, 4 bytes per pixel, width*height*4
// bytes long, matching @flighthq/surface and getImageData. decodeImagePremultiplied returns the
// premultiplied variant of this same shape.
export interface DecodedImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
