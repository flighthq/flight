use flight_bitmap::convert_bitmap_alpha_type;
use flight_compression::HostDecompressDeflateCapability;
use flight_entity::{Uint8Array, throw_error};
use flight_image_codec::{DecodedImage, ImageDecodeOptions};
use flight_texture::AlphaType;

use crate::{SWF_LOSSLESS_ALPHA_MIME_TYPE, SWF_LOSSLESS_MIME_TYPE, create_swf_lossless_bitmap};

pub async fn decode_swf_image(
    bytes: &Uint8Array,
    mime_type: &str,
    deflate: &HostDecompressDeflateCapability,
    options: Option<&ImageDecodeOptions>,
) -> Option<DecodedImage> {
    return match mime_type {
        SWF_LOSSLESS_MIME_TYPE => Some(decode_swf_lossless_image(bytes, false, deflate, options)),
        SWF_LOSSLESS_ALPHA_MIME_TYPE => {
            Some(decode_swf_lossless_image(bytes, true, deflate, options))
        }
        _ => None,
    };
}

fn decode_swf_lossless_image(
    bytes: &[u8],
    has_alpha: bool,
    deflate: &HostDecompressDeflateCapability,
    options: Option<&ImageDecodeOptions>,
) -> DecodedImage {
    let Some(mut bitmap) = create_swf_lossless_bitmap(bytes, has_alpha, deflate) else {
        throw_error("Could not unpack SWF lossless image payload");
    };
    if has_alpha && options.and_then(|value| value.premultiply_alpha) != Some(true) {
        convert_bitmap_alpha_type(&mut bitmap, AlphaType::Straight);
    }
    let height = bitmap.height as usize;
    let width = bitmap.width as usize;
    return DecodedImage {
        data: bitmap.data,
        height,
        width,
    };
}
