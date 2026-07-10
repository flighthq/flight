// The KTX2 supercompression scheme wrapping each level's payload (KTX2 spec §3.11). A lossless outer
// layer that must be inflated before the level bytes are the `TextureContainerFormat` data: `'None'`
// means the level bytes are directly the format data; the others wrap it. `'BasisLZ'` is the Basis
// ETC1S codec (transcoded, not merely inflated); `'Zstd'` and `'ZLIB'` are generic block deflators.
//
// A container parser reports the scheme and the raw (still-wrapped) level byte ranges — it never
// inflates or transcodes them. Handing a supercompressed level to a GPU upload requires the caller to
// inflate it first (Zstd/ZLIB) or route it through a Basis transcoder (BasisLZ). DDS and the `.basis`
// container have no supercompression layer and always report `'None'`.
export type TextureContainerSupercompression = 'None' | 'BasisLZ' | 'Zstd' | 'ZLIB';
