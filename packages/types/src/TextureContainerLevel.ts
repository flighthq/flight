// One contiguous sub-image inside a texture container's payload: a single mip level of a single
// face/layer, and where its bytes live in the source buffer. This is exactly what a GPU upload needs
// to `texImage2D`/`writeTexture` one image, or what a transcoder reads as one input slice.
//
// `byteOffset`/`byteLength` are absolute into the container's byte buffer and address the data as
// stored: if the enclosing level is supercompressed (see `TextureContainerSupercompression`), the
// range is the still-wrapped payload, not the inflated size. `width`/`height` are this mip's pixel
// dimensions (already halved per level, floored at 1), not the block-padded dimensions.
export interface TextureContainerLevel {
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
}
