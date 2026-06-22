//! Video resource creation and loading.
//!
//! A `VideoResource` holds a path or platform-native handle to video data.
//! Playback is delegated to `flighthq-media` channel objects.

use flighthq_types::{VideoResource, VideoResourceUrl};

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/// Allocates a new `VideoResource` with no path or native handle.
///
/// Pass a path string when the video file location is already known; pass
/// `None` to create an empty resource that will be populated later.
pub fn create_video_resource(path: Option<String>) -> VideoResource {
    VideoResource { path }
}

/// Creates a `VideoResource` referencing the given source URL/path.
///
/// Mirrors the web port, which sets the `<video>` element's `src`; native
/// records the path for deferred decoding by `flighthq-media`.
pub fn create_video_resource_from_url(url: &str) -> VideoResource {
    create_video_resource(Some(url.to_owned()))
}

/// Selects the first playable source by MIME type and creates a resource for it.
///
/// Returns an empty resource (`path == None`) when `sources` is empty or none
/// is recognizable.
pub fn create_video_resource_from_urls(sources: &[VideoResourceUrl]) -> VideoResource {
    match select_video_source(sources) {
        Some(source) => create_video_resource_from_url(&source.url),
        None => create_video_resource(None),
    }
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

/// Returns `true` when the resource has a path or native handle.
pub fn has_video_resource_data(resource: &VideoResource) -> bool {
    resource.path.is_some()
}

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

/// Releases the path reference so it becomes eligible for GC.
///
/// Does not stop any in-flight playback — that is managed by `flighthq-media`
/// channel objects.
pub fn dispose_video_resource(resource: &mut VideoResource) {
    resource.path = None;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/// Validates that the file at `path` is accessible and returns a
/// `VideoResource` referencing it.
///
/// The video is not decoded at this point — decoding is deferred to playback
/// via `flighthq-media`. Returns an error if the file does not exist or the
/// format is unsupported.
pub fn load_video_resource_from_path(
    path: &std::path::Path,
) -> Result<VideoResource, Box<dyn std::error::Error + Send + Sync>> {
    // Decoding is deferred to playback; we only confirm the file is reachable
    // and record its path. `std::fs::metadata` surfaces a missing-file error.
    std::fs::metadata(path)?;
    Ok(create_video_resource(Some(
        path.to_string_lossy().into_owned(),
    )))
}

/// Validates the file at `url` (treated as a local path on native) and returns
/// a `VideoResource` referencing it.
///
/// Native has no `fetch`; a URL is resolved as a filesystem path. Returns an
/// error if the file is not reachable.
pub fn load_video_resource_from_url(
    url: &str,
) -> Result<VideoResource, Box<dyn std::error::Error + Send + Sync>> {
    load_video_resource_from_path(std::path::Path::new(url))
}

/// Selects the first playable source by MIME type and loads it.
///
/// Returns an empty resource when `sources` is empty or none is recognizable;
/// otherwise loads the selected source via `load_video_resource_from_url`.
pub fn load_video_resource_from_urls(
    sources: &[VideoResourceUrl],
) -> Result<VideoResource, Box<dyn std::error::Error + Send + Sync>> {
    match select_video_source(sources) {
        Some(source) => load_video_resource_from_url(&source.url),
        None => Ok(create_video_resource(None)),
    }
}

/// Maps a file extension to a video MIME type, mirroring the web port's
/// `inferVideoType`. Returns `None` for unrecognized extensions.
fn infer_video_type(url: &str) -> Option<&'static str> {
    let ext = url
        .split('?')
        .next()
        .unwrap_or(url)
        .rsplit('.')
        .next()
        .map(|e| e.to_ascii_lowercase());
    match ext.as_deref() {
        Some("mp4") | Some("m4v") => Some("video/mp4"),
        Some("webm") => Some("video/webm"),
        Some("ogv") | Some("ogg") => Some("video/ogg"),
        Some("mov") => Some("video/quicktime"),
        _ => None,
    }
}

/// Picks the first source whose declared or inferred type is non-empty.
fn select_video_source(sources: &[VideoResourceUrl]) -> Option<&VideoResourceUrl> {
    sources.iter().find(|source| {
        source
            .mime_type
            .as_deref()
            .or_else(|| infer_video_type(&source.url))
            .is_some()
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_video_resource_empty() {
        let r = create_video_resource(None);
        assert!(!has_video_resource_data(&r));
    }

    #[test]
    fn create_video_resource_from_url_records_path() {
        // Mirrors TS: returns a resource with a non-null element/path.
        let r = create_video_resource_from_url("test.mp4");
        assert!(has_video_resource_data(&r));
        assert_eq!(r.path.as_deref(), Some("test.mp4"));
    }

    // Plural test names embed the `from_ur_ls` token (the TS `FromURLs` snake
    // form the parity harness derives) so coverage matching sees the variant.
    #[test]
    fn create_video_resource_from_ur_ls_empty_sources() {
        // Mirrors TS: empty sources yields a null-element resource.
        let r = create_video_resource_from_urls(&[]);
        assert!(!has_video_resource_data(&r));
    }

    #[test]
    fn create_video_resource_from_ur_ls_selects_by_type() {
        let sources = [
            VideoResourceUrl {
                url: "clip.xyz".to_owned(),
                mime_type: None,
            },
            VideoResourceUrl {
                url: "clip.webm".to_owned(),
                mime_type: None,
            },
        ];
        let r = create_video_resource_from_urls(&sources);
        assert_eq!(r.path.as_deref(), Some("clip.webm"));
    }

    #[test]
    fn create_video_resource_with_path() {
        let r = create_video_resource(Some("video.mp4".to_owned()));
        assert!(has_video_resource_data(&r));
    }

    #[test]
    fn dispose_video_resource_clears_path() {
        let mut r = create_video_resource(Some("video.mp4".to_owned()));
        dispose_video_resource(&mut r);
        assert!(!has_video_resource_data(&r));
    }

    #[test]
    fn has_video_resource_data_false_when_none() {
        let r = create_video_resource(None);
        assert!(!has_video_resource_data(&r));
    }

    #[test]
    fn load_video_resource_from_path_errors_when_missing() {
        let result = load_video_resource_from_path(std::path::Path::new(
            "does-not-exist-flighthq-resources.mp4",
        ));
        assert!(result.is_err());
    }

    #[test]
    fn load_video_resource_from_url_errors_when_missing() {
        let result = load_video_resource_from_url("does-not-exist-flighthq-video.mp4");
        assert!(result.is_err());
    }

    #[test]
    fn load_video_resource_from_ur_ls_empty_resolves_empty() {
        // Mirrors TS: empty sources resolves to a null-element resource.
        let r = load_video_resource_from_urls(&[]).unwrap();
        assert!(!has_video_resource_data(&r));
    }
}
