// Which block-compressed texture families the current WebGL2 device can upload natively, detected
// once from the `WEBGL_compressed_texture_*` extensions. A GPU-native container upload consults this
// to decide whether a `TextureContainerFormat` can go straight to `compressedTexImage2D` or must fall
// back to a CPU RGBA decompress. Each flag maps to one extension family; a device typically exposes a
// subset (desktop GPUs commonly S3TC/RGTC/BPTC, mobile GPUs ETC2/ASTC), so a portable asset pipeline
// ships several encodings and picks the first the device reports here.
//
// `s3tc` covers BC1–BC3 (DXT), `rgtc` BC4/BC5, `bptc` BC6H/BC7; `etc` covers ETC2 + EAC (ETC1 uploads
// through the ETC2 RGB path on ES3-class hardware); `astc` covers all LDR ASTC block sizes; `pvrtc`
// covers the PowerVR family. The corresponding `srgb` twin of each format uploads through the same
// extension, so no separate flag is needed for the sRGB variants.
export interface GlCompressedTextureSupport {
  readonly astc: boolean;
  readonly bptc: boolean;
  readonly etc: boolean;
  readonly pvrtc: boolean;
  readonly rgtc: boolean;
  readonly s3tc: boolean;
}
