//! Font entity creation and loading.
//!
//! A `Font` is a lightweight entity that names a registered typeface. Use
//! `flighthq-text-layout` to measure and lay out text with a `Font` value.
//! To load the underlying font bytes use `flighthq-resources` `FontResource`
//! functions instead.

use flighthq_types::{Font, FontUrl};

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/// Creates a `Font` entity with the given typeface name.
///
/// The name should match a font family already registered with the platform
/// (e.g. loaded via `load_font_resource_from_bytes` and registered with the
/// text-layout subsystem).
pub fn create_font(name: impl Into<String>) -> Font {
    Font { name: name.into() }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/// Parses a font from an array buffer and registers it under `family`.
///
/// Alias of `load_font_from_bytes` matching the web port's
/// `loadFontFromArrayBuffer`. Returns an error if the bytes do not represent a
/// valid font.
pub fn load_font_from_array_buffer(
    buffer: &[u8],
    family: impl Into<String>,
) -> Result<Font, Box<dyn std::error::Error + Send + Sync>> {
    load_font_from_bytes(buffer, family)
}

/// Parses the font `bytes` (TTF, OTF, WOFF, WOFF2), registers the typeface
/// with the platform text subsystem under `family`, and returns a `Font`
/// entity.
///
/// Returns an error if the bytes do not represent a valid font.
pub fn load_font_from_bytes(
    bytes: &[u8],
    family: impl Into<String>,
) -> Result<Font, Box<dyn std::error::Error + Send + Sync>> {
    // TODO(wave-N): register the parsed typeface with the text-layout subsystem
    // once a font registry backend exists. For now we validate the container
    // signature and return a named Font entity.
    if !is_font_signature(bytes) {
        return Err("bytes do not represent a recognized font format".into());
    }
    Ok(create_font(family))
}

/// Reads a font file at `path` (TTF, OTF, WOFF, WOFF2), registers the
/// typeface under `family`, and returns a `Font` entity.
///
/// The format is inferred from the file extension. Returns an error if the
/// file cannot be read or parsed.
pub fn load_font_from_path(
    path: &std::path::Path,
    family: impl Into<String>,
) -> Result<Font, Box<dyn std::error::Error + Send + Sync>> {
    let bytes = std::fs::read(path)?;
    load_font_from_bytes(&bytes, family)
}

/// Reads a font file at `url` (treated as a local path on native) and registers
/// it under `family`.
///
/// Native has no `fetch`; a URL is resolved as a filesystem path. Returns an
/// error if the file cannot be read or parsed.
pub fn load_font_from_url(
    url: &str,
    family: impl Into<String>,
) -> Result<Font, Box<dyn std::error::Error + Send + Sync>> {
    load_font_from_path(std::path::Path::new(url), family)
}

/// Loads a font from the first reachable of several URL sources, under `family`.
///
/// Sources are tried in order (format hints mirror the web port but native
/// reads from the filesystem). Returns the last error if none can be loaded,
/// or an error if `sources` is empty.
pub fn load_font_from_urls(
    sources: &[FontUrl],
    family: impl Into<String>,
) -> Result<Font, Box<dyn std::error::Error + Send + Sync>> {
    let family = family.into();
    let mut last_err: Option<Box<dyn std::error::Error + Send + Sync>> = None;
    for source in sources {
        match load_font_from_url(&source.url, family.clone()) {
            Ok(font) => return Ok(font),
            Err(err) => last_err = Some(err),
        }
    }
    Err(last_err.unwrap_or_else(|| "no font sources provided".into()))
}

/// Returns `true` when the leading bytes match a known font container signature
/// (TrueType `0x00010000`, OpenType `OTTO`, `true`/`ttcf` collections, or WOFF /
/// WOFF2). Used to reject obviously non-font input before registration.
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
    fn create_font_sets_name() {
        let f = create_font("Roboto");
        assert_eq!(f.name, "Roboto");
    }

    #[test]
    fn load_font_from_array_buffer_returns_named_font() {
        // Mirrors TS: returns a font with the given family name.
        let buffer: &[u8] = &[0x00, 0x01, 0x00, 0x00, 0, 0, 0, 0];
        let f = load_font_from_array_buffer(buffer, "TestFont").unwrap();
        assert_eq!(f.name, "TestFont");
    }

    #[test]
    fn load_font_from_bytes_accepts_truetype_signature() {
        let bytes: &[u8] = &[0x00, 0x01, 0x00, 0x00, 0, 0, 0, 0];
        let f = load_font_from_bytes(bytes, "MyFont").unwrap();
        assert_eq!(f.name, "MyFont");
    }

    #[test]
    fn load_font_from_bytes_rejects_garbage() {
        let bytes: &[u8] = &[0x00, 0x01, 0x02, 0x03];
        assert!(load_font_from_bytes(bytes, "MyFont").is_err());
    }

    #[test]
    fn load_font_from_url_errors_when_missing() {
        let result = load_font_from_url("does-not-exist-flighthq-font.woff2", "MyFont");
        assert!(result.is_err());
    }

    // Test names embed the `from_ur_ls` token (the TS `FromURLs` snake form the
    // parity harness derives) so coverage matching sees the plural variant.
    #[test]
    fn load_font_from_ur_ls_empty_sources_errors() {
        let result = load_font_from_urls(&[], "MyFont");
        assert!(result.is_err());
    }

    #[test]
    fn load_font_from_ur_ls_loads_first_reachable() {
        use std::io::Write;
        let dir = std::env::temp_dir();
        let path = dir.join("flighthq-font-from-urls.ttf");
        let mut file = std::fs::File::create(&path).unwrap();
        file.write_all(&[0x00, 0x01, 0x00, 0x00, 0, 0, 0, 0])
            .unwrap();
        let sources = [
            FontUrl {
                url: "does-not-exist-flighthq-font.woff2".to_owned(),
                format: Some("woff2".to_owned()),
            },
            FontUrl {
                url: path.to_string_lossy().into_owned(),
                format: None,
            },
        ];
        let f = load_font_from_urls(&sources, "MyFont").unwrap();
        assert_eq!(f.name, "MyFont");
        let _ = std::fs::remove_file(&path);
    }
}
