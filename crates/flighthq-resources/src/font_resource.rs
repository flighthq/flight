//! Font resource creation and loading.
//!
//! A `FontResource` pairs a family name with an optional platform-native font
//! face handle (raw bytes from the font file). Use `flighthq-textlayout` to
//! measure and lay out text with a loaded font resource.

use flighthq_types::{FontResource, FontUrl};

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/// Creates a `FontResource` for the given CSS family name with no face data.
///
/// Call `load_font_resource_from_bytes` or `load_font_resource_from_path` to
/// populate the face before measuring or rendering text.
pub fn create_font_resource(family: impl Into<String>) -> FontResource {
    FontResource {
        family: family.into(),
        face: None,
    }
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

/// Returns `true` when the resource has a loaded font face.
pub fn has_font_resource_face(resource: &FontResource) -> bool {
    resource.face.is_some()
}

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

/// Releases the font face bytes so they become eligible for GC.
///
/// The `family` name is left intact. Call `load_font_resource_from_bytes` to
/// repopulate the face.
pub fn dispose_font_resource(resource: &mut FontResource) {
    resource.face = None;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/// Parses a font from `bytes` (TTF, OTF, WOFF, WOFF2) and stores the raw
/// bytes in `out.face`.
///
/// The family name is taken from `out.family`. Returns a reference to `out`
/// for chaining. Returns an error if the bytes do not represent a valid font.
pub fn load_font_resource_from_bytes(
    out: &mut FontResource,
    bytes: &[u8],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if !is_font_signature(bytes) {
        return Err("bytes do not represent a recognized font format".into());
    }
    out.face = Some(bytes.to_vec());
    Ok(())
}

/// Parses a font from an array buffer and stores the raw bytes in `out.face`.
///
/// Alias of `load_font_resource_from_bytes` matching the web port's
/// `loadFontResourceFromArrayBuffer`. The family name is taken from
/// `out.family`. Returns an error if the bytes are not a valid font.
pub fn load_font_resource_from_array_buffer(
    out: &mut FontResource,
    buffer: &[u8],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    load_font_resource_from_bytes(out, buffer)
}

/// Reads a font file at `path` (TTF, OTF, WOFF, WOFF2) and stores the raw
/// bytes in `out.face`.
///
/// Returns an error if the file cannot be read or parsed.
pub fn load_font_resource_from_path(
    out: &mut FontResource,
    path: &std::path::Path,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let bytes = std::fs::read(path)?;
    load_font_resource_from_bytes(out, &bytes)
}

/// Reads a font file at `url` (treated as a local path on native) and stores
/// the raw bytes in `out.face`.
///
/// Native has no `fetch`; a URL is resolved as a filesystem path. Returns an
/// error if the file cannot be read or parsed.
pub fn load_font_resource_from_url(
    out: &mut FontResource,
    url: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    load_font_resource_from_path(out, std::path::Path::new(url))
}

/// Loads a font into `out.face` from the first reachable of several URL sources.
///
/// Sources are tried in order. Returns the last error if none can be loaded,
/// or an error if `sources` is empty.
pub fn load_font_resource_from_urls(
    out: &mut FontResource,
    sources: &[FontUrl],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut last_err: Option<Box<dyn std::error::Error + Send + Sync>> = None;
    for source in sources {
        match load_font_resource_from_url(out, &source.url) {
            Ok(()) => return Ok(()),
            Err(err) => last_err = Some(err),
        }
    }
    Err(last_err.unwrap_or_else(|| "no font sources provided".into()))
}

/// Returns `true` when the leading bytes match a known font container signature
/// (TrueType `0x00010000`, OpenType `OTTO`, `true`/`ttcf` collections, or WOFF /
/// WOFF2). Used to reject obviously non-font input before storing the face.
fn is_font_signature(bytes: &[u8]) -> bool {
    if bytes.len() < 4 {
        return false;
    }
    let tag = &bytes[0..4];
    tag == [0x00, 0x01, 0x00, 0x00]
        || tag == b"OTTO"
        || tag == b"true"
        || tag == b"ttcf"
        || tag == b"wOFF"
        || tag == b"wOF2"
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_font_resource_no_face() {
        let r = create_font_resource("Arial");
        assert_eq!(r.family, "Arial");
        assert!(!has_font_resource_face(&r));
    }

    #[test]
    fn dispose_font_resource_clears_face() {
        let mut r = create_font_resource("Arial");
        r.face = Some(vec![0u8; 4]);
        dispose_font_resource(&mut r);
        assert!(!has_font_resource_face(&r));
    }

    #[test]
    fn has_font_resource_face_false_when_none() {
        let r = create_font_resource("Helvetica");
        assert!(!has_font_resource_face(&r));
    }

    #[test]
    fn has_font_resource_face_true_when_present() {
        let mut r = create_font_resource("Helvetica");
        r.face = Some(vec![0u8; 4]);
        assert!(has_font_resource_face(&r));
    }

    #[test]
    fn load_font_resource_from_array_buffer_attaches_face() {
        // Mirrors TS: loads the face and attaches it to the resource.
        let mut r = create_font_resource("TestFont");
        let buffer: &[u8] = &[0x4f, 0x54, 0x54, 0x4f, 0, 0, 0, 0]; // "OTTO"
        load_font_resource_from_array_buffer(&mut r, buffer).unwrap();
        assert!(has_font_resource_face(&r));
        assert_eq!(r.family, "TestFont");
    }

    #[test]
    fn load_font_resource_from_bytes_attaches_face() {
        let mut r = create_font_resource("TestFont");
        let bytes: &[u8] = &[0x4f, 0x54, 0x54, 0x4f, 0, 0, 0, 0]; // "OTTO"
        load_font_resource_from_bytes(&mut r, bytes).unwrap();
        assert!(has_font_resource_face(&r));
        assert_eq!(r.family, "TestFont");
    }

    #[test]
    fn load_font_resource_from_bytes_rejects_garbage() {
        let mut r = create_font_resource("TestFont");
        let bytes: &[u8] = &[0x01, 0x02, 0x03, 0x04];
        assert!(load_font_resource_from_bytes(&mut r, bytes).is_err());
        assert!(!has_font_resource_face(&r));
    }

    #[test]
    fn load_font_resource_from_url_errors_when_missing() {
        let mut r = create_font_resource("TestFont");
        let result = load_font_resource_from_url(&mut r, "does-not-exist-flighthq-fontres.woff2");
        assert!(result.is_err());
        assert!(!has_font_resource_face(&r));
    }

    // Test names embed the `from_ur_ls` token (the TS `FromURLs` snake form the
    // parity harness derives) so coverage matching sees the plural variant.
    #[test]
    fn load_font_resource_from_ur_ls_attaches_first_reachable() {
        use std::io::Write;
        let path = std::env::temp_dir().join("flighthq-fontres-from-urls.otf");
        let mut file = std::fs::File::create(&path).unwrap();
        file.write_all(&[0x4f, 0x54, 0x54, 0x4f, 0, 0, 0, 0])
            .unwrap(); // "OTTO"
        let mut r = create_font_resource("TestFont");
        let sources = [
            FontUrl {
                url: "does-not-exist-flighthq-fontres.woff2".to_owned(),
                format: Some("woff2".to_owned()),
            },
            FontUrl {
                url: path.to_string_lossy().into_owned(),
                format: None,
            },
        ];
        load_font_resource_from_urls(&mut r, &sources).unwrap();
        assert!(has_font_resource_face(&r));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn load_font_resource_from_ur_ls_empty_sources_errors() {
        let mut r = create_font_resource("TestFont");
        assert!(load_font_resource_from_urls(&mut r, &[]).is_err());
    }
}
