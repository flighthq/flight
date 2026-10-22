use std::panic::{AssertUnwindSafe, resume_unwind};
use std::sync::Arc;

use flight_image::{HostImageCapability, ImageResourceFetch, load_image_resource_from_url};
use flight_stream::is_abort_signal_aborted;
use futures::FutureExt;

/// Fetch seam over the host image loader. An expected load failure is the `None` miss; a rejection
/// after the signal aborted is a cancellation and keeps unwinding.
pub fn create_web_image_resource_fetch(host_image: &HostImageCapability) -> ImageResourceFetch {
    let host_image = host_image.clone();
    return Arc::new(move |reference, signal| {
        let host_image = host_image.clone();
        Box::pin(async move {
            let url = {
                let reference = reference.read().unwrap();
                resolve_image_resource_uri(&reference.uri, reference.base_path.as_deref())
            };
            let result = AssertUnwindSafe(load_image_resource_from_url(
                &host_image,
                &url,
                None,
                Some(&signal),
            ))
            .catch_unwind()
            .await;
            return match result {
                Ok(image) => Some(image),
                Err(payload) => {
                    if is_abort_signal_aborted(&signal) {
                        resume_unwind(payload);
                    }
                    None
                }
            };
        })
    });
}

// The source's `/^[a-zA-Z][a-zA-Z0-9+.-]*:/` scheme test, spelled out over the ASCII bytes.
fn is_absolute_image_resource_uri(uri: &str) -> bool {
    if uri.starts_with('/') {
        return true;
    }
    let bytes = uri.as_bytes();
    if bytes
        .first()
        .is_none_or(|first| !first.is_ascii_alphabetic())
    {
        return false;
    }
    for &byte in &bytes[1..] {
        if byte == b':' {
            return true;
        }
        if !(byte.is_ascii_alphanumeric() || byte == b'+' || byte == b'.' || byte == b'-') {
            return false;
        }
    }
    return false;
}

pub fn resolve_image_resource_uri(uri: &str, base_path: Option<&str>) -> String {
    let Some(base_path) = base_path else {
        return uri.to_string();
    };
    if is_absolute_image_resource_uri(uri) {
        return uri.to_string();
    }
    if base_path.ends_with('/') || uri.starts_with('/') {
        return format!("{base_path}{uri}");
    }
    return format!("{base_path}/{uri}");
}
