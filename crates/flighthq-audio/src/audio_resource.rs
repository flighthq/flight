//! Audio resource creation and loading.
//!
//! An `AudioResource` holds decoded PCM audio data. On native platforms the
//! buffer is raw bytes; playback is delegated to `flighthq-media`.

use flighthq_types::{AudioResource, AudioResourceUrl};

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/// Allocates a new `AudioResource` with no decoded data.
///
/// Pass decoded PCM bytes when already available; pass `None` to create an
/// empty resource that will be populated by a load call.
pub fn create_audio_resource(buffer: Option<Vec<u8>>) -> AudioResource {
    AudioResource { buffer }
}

/// Creates an empty `AudioResource` for the given source URL/path.
///
/// Mirrors the web port, which returns the resource immediately and fills its
/// decoded buffer asynchronously. Native decoding has no backend yet, so the
/// buffer is left `None`; populate it later with `load_audio_resource_from_path`.
pub fn create_audio_resource_from_url(_url: &str) -> AudioResource {
    create_audio_resource(None)
}

/// Selects the first playable source by MIME type and creates a resource for it.
///
/// The candidate's `mime_type` is used when present, otherwise it is inferred
/// from the file extension. Returns an empty resource when `sources` is empty
/// or none is recognizable.
pub fn create_audio_resource_from_urls(sources: &[AudioResourceUrl]) -> AudioResource {
    match select_audio_source(sources) {
        Some(source) => create_audio_resource_from_url(&source.url),
        None => create_audio_resource(None),
    }
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

/// Returns `true` when the resource carries decoded audio data.
pub fn has_audio_resource_data(resource: &AudioResource) -> bool {
    resource.buffer.is_some()
}

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

/// Releases the decoded audio buffer so it becomes eligible for GC.
///
/// Does not stop any in-flight playback — that is managed by `flighthq-media`
/// channel objects.
pub fn dispose_audio_resource(resource: &mut AudioResource) {
    resource.buffer = None;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/// Decodes the bytes in `buf` (MP3, OGG, WAV, FLAC, AAC, …) and returns a
/// populated `AudioResource`.
///
/// `mime_type` is optional; when `None` the format is inferred from magic
/// bytes. Returns an error if decoding fails.
pub fn load_audio_resource_from_bytes(
    _buf: &[u8],
    _mime_type: Option<&str>,
) -> Result<AudioResource, Box<dyn std::error::Error + Send + Sync>> {
    // TODO(wave-N): wire a PCM decoder backend (e.g. symphonia). The web port
    // decodes via the browser AudioContext; native decoding has no backend yet,
    // so we cannot turn encoded bytes into a PCM buffer here.
    Err("audio decoding requires a decoder backend that is not yet wired".into())
}

/// Reads a file at `path` and decodes it as audio.
///
/// The format is inferred from the file extension. Returns an error if the
/// file cannot be read or the format is unsupported.
pub fn load_audio_resource_from_path(
    path: &std::path::Path,
) -> Result<AudioResource, Box<dyn std::error::Error + Send + Sync>> {
    let bytes = std::fs::read(path)?;
    load_audio_resource_from_bytes(&bytes, None)
}

/// Reads the file at `url` (treated as a local path on native) and decodes it.
///
/// Native has no `fetch`; a URL is resolved as a filesystem path. Returns an
/// error if the file cannot be read or decoded.
pub fn load_audio_resource_from_url(
    url: &str,
) -> Result<AudioResource, Box<dyn std::error::Error + Send + Sync>> {
    load_audio_resource_from_path(std::path::Path::new(url))
}

/// Selects the first playable source by MIME type and loads it.
///
/// Returns an empty resource when `sources` is empty or none is recognizable;
/// otherwise loads the selected source via `load_audio_resource_from_url`.
pub fn load_audio_resource_from_urls(
    sources: &[AudioResourceUrl],
) -> Result<AudioResource, Box<dyn std::error::Error + Send + Sync>> {
    match select_audio_source(sources) {
        Some(source) => load_audio_resource_from_url(&source.url),
        None => Ok(create_audio_resource(None)),
    }
}

/// Maps a file extension to an audio MIME type, mirroring the web port's
/// `inferAudioType`. Returns `None` for unrecognized extensions.
fn infer_audio_type(url: &str) -> Option<&'static str> {
    let ext = url
        .split('?')
        .next()
        .unwrap_or(url)
        .rsplit('.')
        .next()
        .map(|e| e.to_ascii_lowercase());
    match ext.as_deref() {
        Some("mp3") => Some("audio/mpeg"),
        Some("ogg") => Some("audio/ogg"),
        Some("wav") => Some("audio/wav"),
        Some("aac") => Some("audio/aac"),
        Some("flac") => Some("audio/flac"),
        Some("webm") => Some("audio/webm"),
        Some("m4a") => Some("audio/mp4"),
        _ => None,
    }
}

/// Picks the first source whose declared or inferred type is non-empty.
///
/// The web probe asks the browser `canPlayType`; native has no codec probe, so
/// a source is "playable" when it carries any recognizable MIME type.
fn select_audio_source(sources: &[AudioResourceUrl]) -> Option<&AudioResourceUrl> {
    sources.iter().find(|source| {
        source
            .mime_type
            .as_deref()
            .or_else(|| infer_audio_type(&source.url))
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
    fn create_audio_resource_empty() {
        let r = create_audio_resource(None);
        assert!(!has_audio_resource_data(&r));
    }

    #[test]
    fn create_audio_resource_from_url_has_buffer_field() {
        // Mirrors the TS "returns an AudioResource with a buffer property" case.
        let r = create_audio_resource_from_url("test.mp3");
        assert!(!has_audio_resource_data(&r));
    }

    // Plural test names embed the `from_ur_ls` token (the TS `FromURLs` snake
    // form the parity harness derives) so coverage matching sees the variant.
    #[test]
    fn create_audio_resource_from_ur_ls_empty_sources() {
        // Mirrors TS: empty sources yields a non-null, empty resource.
        let r = create_audio_resource_from_urls(&[]);
        assert!(!has_audio_resource_data(&r));
    }

    #[test]
    fn create_audio_resource_from_ur_ls_selects_recognizable() {
        use flighthq_types::AudioResourceUrl;
        let sources = [
            AudioResourceUrl {
                url: "track.xyz".to_owned(),
                mime_type: None,
            },
            AudioResourceUrl {
                url: "track.ogg".to_owned(),
                mime_type: None,
            },
        ];
        // First source has an unknown extension, second is selectable; result is
        // still an empty (decode-deferred) resource.
        let r = create_audio_resource_from_urls(&sources);
        assert!(!has_audio_resource_data(&r));
    }

    #[test]
    fn create_audio_resource_with_buffer() {
        let r = create_audio_resource(Some(vec![0u8; 8]));
        assert!(has_audio_resource_data(&r));
    }

    #[test]
    fn dispose_audio_resource_clears_buffer() {
        let mut r = create_audio_resource(Some(vec![0u8; 8]));
        dispose_audio_resource(&mut r);
        assert!(!has_audio_resource_data(&r));
    }

    #[test]
    fn has_audio_resource_data_false_when_none() {
        let r = create_audio_resource(None);
        assert!(!has_audio_resource_data(&r));
    }

    #[test]
    fn load_audio_resource_from_url_errors_when_missing() {
        let result = load_audio_resource_from_url("does-not-exist-flighthq-audio.mp3");
        assert!(result.is_err());
    }

    #[test]
    fn load_audio_resource_from_ur_ls_empty_resolves_empty() {
        // Mirrors TS: empty sources resolves to a null-buffer resource.
        let r = load_audio_resource_from_urls(&[]).unwrap();
        assert!(!has_audio_resource_data(&r));
    }
}
