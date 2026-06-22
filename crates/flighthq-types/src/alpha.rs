/// How an `ImageResource`'s pixels encode alpha. Orthogonal to channel layout and color space.
///
/// - `Straight`: RGB is independent of alpha (un-premultiplied). Flight's default.
/// - `Premultiplied`: RGB has already been multiplied by alpha.
/// - `Opaque`: alpha is implicitly 1 everywhere; a fast-path hint.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum AlphaType {
    #[default]
    Straight,
    Premultiplied,
    Opaque,
}
