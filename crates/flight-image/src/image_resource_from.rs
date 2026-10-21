use flight_bitmap::{Bitmap, HostBitmapReadbackCapability, create_bitmap_from_image_source};
use flight_buffer::{Blob, get_array_buffer_storage, read_blob_array_buffer};
use flight_entity::{FlightError, FlightErrorKind, Ref, Uint8Array};
use flight_image_codec::detect_image_mime_type;
use flight_stream::{AbortSignal, throw_if_aborted};
use flight_surface::SurfaceRef;
use url::Url;

use crate::types::{HostImageCapability, ImageCrossOrigin, ImageResource, ImageUrlOriginContext};

pub fn create_image_resource_from_bitmap(
    host_image: &HostImageCapability,
    bitmap: &Bitmap,
) -> Option<Ref<ImageResource>> {
    let create = host_image.create_image_from_bitmap.as_ref()?;
    return Some(create(bitmap));
}

// flight-lint: allow(conform-extra) D8 host surface-to-image bridge consumes the canonical SurfaceRef owner after the ownership move
pub fn create_image_resource_from_surface(
    host_image: &HostImageCapability,
    surface: &SurfaceRef,
) -> Option<Ref<ImageResource>> {
    let create = host_image.create_image_from_surface.as_ref()?;
    return Some(create(surface));
}

/// Captures the resource's exact host source and declared dimensions through the canonical bitmap
/// readback capability. Expected backend refusals remain `None`; host throws propagate unchanged.
// flight-lint: allow(conform-extra) D8 approved ownership move from bitmap to image; the pinned TS archive predates the matching source move
pub fn capture_bitmap_from_image_resource(
    host_bitmap_readback: &HostBitmapReadbackCapability,
    resource: &Ref<ImageResource>,
) -> Option<Bitmap> {
    let (source, width, height) = {
        let resource = resource.read().unwrap();
        (resource.source.clone(), resource.width, resource.height)
    };
    return create_bitmap_from_image_source(host_bitmap_readback, &source, width, height);
}

fn encode_base64(bytes: &Uint8Array) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    let mut index = 0;
    while index + 3 <= bytes.len() {
        let value = (u32::from(bytes[index]) << 16)
            | (u32::from(bytes[index + 1]) << 8)
            | u32::from(bytes[index + 2]);
        out.push(ALPHABET[((value >> 18) & 0x3f) as usize] as char);
        out.push(ALPHABET[((value >> 12) & 0x3f) as usize] as char);
        out.push(ALPHABET[((value >> 6) & 0x3f) as usize] as char);
        out.push(ALPHABET[(value & 0x3f) as usize] as char);
        index += 3;
    }
    let remaining = bytes.len() - index;
    if remaining == 1 {
        let value = u32::from(bytes[index]) << 16;
        out.push(ALPHABET[((value >> 18) & 0x3f) as usize] as char);
        out.push(ALPHABET[((value >> 12) & 0x3f) as usize] as char);
        out.push('=');
        out.push('=');
    } else if remaining == 2 {
        let value = (u32::from(bytes[index]) << 16) | (u32::from(bytes[index + 1]) << 8);
        out.push(ALPHABET[((value >> 18) & 0x3f) as usize] as char);
        out.push(ALPHABET[((value >> 12) & 0x3f) as usize] as char);
        out.push(ALPHABET[((value >> 6) & 0x3f) as usize] as char);
        out.push('=');
    }
    return out;
}

fn get_image_data_url(bytes: &Uint8Array, mime_type: Option<&str>) -> String {
    let resolved_type = mime_type
        .map(str::to_string)
        .or_else(|| detect_image_mime_type(bytes))
        .unwrap_or_else(|| {
            std::panic::panic_any(FlightError {
                kind: FlightErrorKind::Error,
                message: "Unable to determine image type from bytes".to_string(),
            });
        });
    return format!("data:{resolved_type};base64,{}", encode_base64(bytes));
}

// flight-lint: allow(conform-params) D5 explicit origin context replaces source reads of global location
pub fn is_image_url_same_origin(url: &str, context: &ImageUrlOriginContext) -> bool {
    if url.starts_with("data:") || url.starts_with("blob:") {
        return true;
    }
    let parsed = match Url::parse(url) {
        Ok(parsed) => parsed,
        Err(_) => {
            let Ok(base) = Url::parse(&context.href) else {
                return true;
            };
            let Ok(parsed) = base.join(url) else {
                return true;
            };
            parsed
        }
    };
    return parsed.origin().ascii_serialization() == context.origin;
}

pub async fn load_image_resource_from_base64(
    host_image: &HostImageCapability,
    base64: &str,
    mime_type: &str,
    signal: Option<&AbortSignal>,
) -> Ref<ImageResource> {
    let url = format!("data:{mime_type};base64,{base64}");
    return load_image_resource_from_url(host_image, &url, None, signal).await;
}

pub async fn load_image_resource_from_blob(
    host_image: &HostImageCapability,
    blob: &Blob,
    signal: Option<&AbortSignal>,
) -> Ref<ImageResource> {
    if let Some(signal) = signal {
        throw_if_aborted(signal);
    }
    let array_buffer = match read_blob_array_buffer(blob).await {
        Ok(array_buffer) => array_buffer,
        Err(cause) => std::panic::panic_any(cause),
    };
    if let Some(signal) = signal {
        throw_if_aborted(signal);
    }
    let storage = get_array_buffer_storage(&array_buffer);
    let url = {
        let storage = storage.read().unwrap();
        let mime_type = (!blob.mime_type.is_empty()).then_some(blob.mime_type.as_str());
        get_image_data_url(storage.as_ref(), mime_type)
    };
    return load_image_resource_from_url(host_image, &url, None, signal).await;
}

pub async fn load_image_resource_from_bytes(
    host_image: &HostImageCapability,
    bytes: &Uint8Array,
    mime_type: Option<&str>,
    signal: Option<&AbortSignal>,
) -> Ref<ImageResource> {
    let url = get_image_data_url(bytes, mime_type);
    return load_image_resource_from_url(host_image, &url, None, signal).await;
}

pub async fn load_image_resource_from_url(
    host_image: &HostImageCapability,
    url: &str,
    cross_origin: Option<ImageCrossOrigin>,
    signal: Option<&AbortSignal>,
) -> Ref<ImageResource> {
    return (host_image.load_image_from_url)(url.to_string(), cross_origin, signal.cloned()).await;
}
