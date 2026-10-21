use std::panic::{AssertUnwindSafe, catch_unwind};

use flight_buffer::get_array_buffer_storage;
use flight_entity::Uint8Array;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::Arc;

    use crate::contract::*;

    fn bare_host(can_play: bool) -> HostVideoCapability {
        return HostVideoCapability {
            provider: Arc::new(()),
            add_ended_listener: None,
            attach_stream: None,
            can_play_type: Arc::new(move |_mime| can_play),
            create_object_url: None,
            create_video_element: None,
            get_current_time: None,
            get_duration: None,
            get_height: None,
            get_loop: None,
            get_muted: None,
            get_playback_rate: None,
            get_volume: None,
            get_width: None,
            is_ready: None,
            load_url: None,
            pause: None,
            play: None,
            release_element: None,
            remove_ended_listener: None,
            revoke_object_url: None,
            set_current_time: None,
            set_loop: None,
            set_muted: None,
            set_playback_rate: None,
            set_volume: None,
        };
    }

    #[test]
    fn hostvideocapability_can_play_video_type_matches_can_play_video_type() {
        let s = bare_host(true);
        assert_eq!(
            s.can_play_video_type("video/mp4"),
            can_play_video_type(&s, "video/mp4")
        );
    }

    #[test]
    fn hostvideocapability_select_video_resource_url_matches_select_video_resource_url() {
        let s = bare_host(true);
        let sources = vec![VideoResourceUrl {
            url: "clip.webm".to_string(),
            type_: None,
        }];
        let ra = s.select_video_resource_url(&sources);
        let rb = select_video_resource_url(&s, &sources);
        assert!(std::ptr::eq(ra.unwrap(), rb.unwrap()));
    }
}

/// Whether the host can play `mime_type`. An empty type is never playable and does not reach the host;
/// a host probe that panics (the source's throw) answers false.
pub fn can_play_video_type(backend: &HostVideoCapability, mime_type: &str) -> bool {
    if mime_type.is_empty() {
        return false;
    }
    return probe_selected_backend(backend, mime_type);
}

/// Detects the container from its byte signature: an MP4 `ftyp` box at offset 4, a Matroska/WebM EBML
/// header, or an Ogg page. `None` for fewer than 4 bytes or an unknown header. Reads either declared
/// source form (the whole `ArrayBuffer`, or a `Uint8Array` view) in place.
pub fn detect_video_mime_type(data: VideoMimeTypeData<'_>) -> Option<&'static str> {
    return match data {
        VideoMimeTypeData::ArrayBuffer(buffer) => {
            let storage = get_array_buffer_storage(buffer.data);
            let bytes = storage.read().unwrap();
            detect_video_mime_type_bytes(&bytes)
        }
        VideoMimeTypeData::Uint8Array(view) => detect_video_mime_type_bytes(view.data),
    };
}

fn detect_video_mime_type_bytes(b: &Uint8Array) -> Option<&'static str> {
    if b.len() < 4 {
        return None;
    }
    if b.len() >= 8 && b[4] == 0x66 && b[5] == 0x74 && b[6] == 0x79 && b[7] == 0x70 {
        return Some("video/mp4");
    }
    if b[0] == 0x1a && b[1] == 0x45 && b[2] == 0xdf && b[3] == 0xa3 {
        return Some("video/webm");
    }
    if b[0] == 0x4f && b[1] == 0x67 && b[2] == 0x67 && b[3] == 0x53 {
        return Some("video/ogg");
    }
    return None;
}

/// Infers a MIME type from the URL's extension: the text after the last `.` of the part before the
/// first `?`, lowercased.
pub fn infer_video_mime_type(url: &str) -> Option<&'static str> {
    let path = url.split('?').next().unwrap_or("");
    let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
    return match ext.as_str() {
        "mp4" | "m4v" => Some("video/mp4"),
        "webm" => Some("video/webm"),
        "mkv" => Some("video/x-matroska"),
        "ogv" | "ogg" => Some("video/ogg"),
        "mov" => Some("video/quicktime"),
        "3gp" => Some("video/3gpp"),
        "m3u8" => Some("application/vnd.apple.mpegurl"),
        "mpd" => Some("application/dash+xml"),
        _ => None,
    };
}

// The source's try { canPlayType(...) === true } catch { false }.
fn probe_selected_backend(backend: &HostVideoCapability, mime_type: &str) -> bool {
    if mime_type.is_empty() {
        return false;
    }
    return catch_unwind(AssertUnwindSafe(|| (backend.can_play_type)(mime_type))).unwrap_or(false);
}

/// The first source the host can play, by identity: an explicit `type_` is authoritative (an explicit
/// empty type is skipped without reading the URL); otherwise the type is inferred from the URL, and a
/// source with no known type is skipped without asking the host.
pub fn select_video_resource_url<'a>(
    backend: &HostVideoCapability,
    sources: &'a [VideoResourceUrl],
) -> Option<&'a VideoResourceUrl> {
    for source in sources {
        let mime_type = match &source.type_ {
            Some(explicit) => explicit.as_str(),
            None => infer_video_mime_type(&source.url).unwrap_or(""),
        };
        if mime_type.is_empty() {
            continue;
        }
        if probe_selected_backend(backend, mime_type) {
            return Some(source);
        }
    }
    return None;
}

impl HostVideoCapability {
    pub fn can_play_video_type(&self, mime_type: &str) -> bool {
        return can_play_video_type(self, mime_type);
    }

    pub fn select_video_resource_url<'a>(
        &self,
        sources: &'a [VideoResourceUrl],
    ) -> Option<&'a VideoResourceUrl> {
        return select_video_resource_url(self, sources);
    }
}
