use std::collections::HashMap;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::test_support::block_on;
    use std::sync::Arc;

    fn bookmark_host() -> HostClipboardBookmarkCapability {
        return HostClipboardBookmarkCapability {
            read_bookmark: Arc::new(|| {
                let future: ClipboardBookmarkFuture = Box::pin(async {
                    Some(ClipboardBookmark {
                        title: "Flight".to_string(),
                        url: "https://example.com".to_string(),
                    })
                });
                return future;
            }),
            write_bookmark: Arc::new(|_title: String, _url: String| {
                let future: ClipboardBoolFuture = Box::pin(async { true });
                return future;
            }),
        };
    }

    fn formats_host() -> HostClipboardFormatsCapability {
        return HostClipboardFormatsCapability {
            get_formats: Arc::new(|| {
                let future: ClipboardStringsFuture =
                    Box::pin(async { vec![CLIPBOARD_FORMAT_TEXT.to_string()] });
                return future;
            }),
            has_format: Arc::new(|format: String| {
                let future: ClipboardBoolFuture =
                    Box::pin(async move { format == CLIPBOARD_FORMAT_TEXT });
                return future;
            }),
            read_format: Arc::new(|format: String| {
                let future: ClipboardStringFuture = Box::pin(async move { format });
                return future;
            }),
            read_html: Arc::new(|| {
                let future: ClipboardStringFuture = Box::pin(async { "<b>html</b>".to_string() });
                return future;
            }),
            read_items: Arc::new(|formats: Vec<String>| {
                let future: ClipboardItemsFuture = Box::pin(async move {
                    let mut result: HashMap<String, String> = HashMap::new();
                    for format in formats {
                        result.insert(format.clone(), format);
                    }
                    return result;
                });
                return future;
            }),
            read_rtf: Arc::new(|| {
                let future: ClipboardStringFuture = Box::pin(async { "{\\rtf1 rich}".to_string() });
                return future;
            }),
            write_format: Arc::new(|_format: String, _data: String| {
                let future: ClipboardBoolFuture = Box::pin(async { true });
                return future;
            }),
            write_html: Arc::new(|_html: String| {
                let future: ClipboardBoolFuture = Box::pin(async { true });
                return future;
            }),
            write_items: Arc::new(|_items: Vec<ClipboardWriteItem>| {
                let future: ClipboardBoolFuture = Box::pin(async { true });
                return future;
            }),
            write_rtf: Arc::new(|_rtf: String| {
                let future: ClipboardBoolFuture = Box::pin(async { true });
                return future;
            }),
        };
    }

    fn image_host() -> HostClipboardImageCapability {
        return HostClipboardImageCapability {
            has_image: Arc::new(|| {
                let future: ClipboardBoolFuture = Box::pin(async { true });
                return future;
            }),
            read_image: Arc::new(|| {
                let future: ClipboardStringFuture =
                    Box::pin(async { "data:image/png".to_string() });
                return future;
            }),
            write_image: Arc::new(|_data_url: String| {
                let future: ClipboardBoolFuture = Box::pin(async { true });
                return future;
            }),
        };
    }

    fn text_host() -> HostClipboardTextCapability {
        return HostClipboardTextCapability {
            clear: Arc::new(|| {
                let future: ClipboardBoolFuture = Box::pin(async { true });
                return future;
            }),
            has_text: Arc::new(|| {
                let future: ClipboardBoolFuture = Box::pin(async { true });
                return future;
            }),
            read_text: Arc::new(|| {
                let future: ClipboardStringFuture = Box::pin(async { "plain".to_string() });
                return future;
            }),
            write_text: Arc::new(|_text: String| {
                let future: ClipboardBoolFuture = Box::pin(async { true });
                return future;
            }),
        };
    }

    #[test]
    fn has_bookmark_method_matches_has_clipboard_bookmark() {
        let method_host = bookmark_host();
        let free_host = bookmark_host();
        assert_eq!(
            block_on(method_host.has_bookmark()),
            block_on(has_clipboard_bookmark(&free_host))
        );
    }

    #[test]
    fn read_bookmark_method_matches_read_clipboard_bookmark() {
        let method_host = bookmark_host();
        let free_host = bookmark_host();
        assert_eq!(
            block_on(method_host.read_bookmark()),
            block_on(read_clipboard_bookmark(&free_host))
        );
    }

    #[test]
    fn write_bookmark_method_matches_write_clipboard_bookmark() {
        let method_host = bookmark_host();
        let free_host = bookmark_host();
        assert_eq!(
            block_on(method_host.write_bookmark("Flight", "https://example.com")),
            block_on(write_clipboard_bookmark(
                &free_host,
                "Flight",
                "https://example.com"
            ))
        );
    }

    #[test]
    fn get_formats_method_matches_get_clipboard_formats() {
        let method_host = formats_host();
        let free_host = formats_host();
        assert_eq!(
            block_on(method_host.get_formats()),
            block_on(get_clipboard_formats(&free_host))
        );
    }

    #[test]
    fn has_format_method_matches_has_clipboard_format() {
        let method_host = formats_host();
        let free_host = formats_host();
        assert_eq!(
            block_on(method_host.has_format(CLIPBOARD_FORMAT_TEXT)),
            block_on(has_clipboard_format(&free_host, CLIPBOARD_FORMAT_TEXT))
        );
    }

    #[test]
    fn has_html_method_matches_has_clipboard_html() {
        let method_host = formats_host();
        let free_host = formats_host();
        assert_eq!(
            block_on(method_host.has_html()),
            block_on(has_clipboard_html(&free_host))
        );
    }

    #[test]
    fn has_rtf_method_matches_has_clipboard_rtf() {
        let method_host = formats_host();
        let free_host = formats_host();
        assert_eq!(
            block_on(method_host.has_rtf()),
            block_on(has_clipboard_rtf(&free_host))
        );
    }

    #[test]
    fn read_method_matches_read_clipboard() {
        let method_host = formats_host();
        let free_host = formats_host();
        let formats = [CLIPBOARD_FORMAT_TEXT.to_string()];
        assert_eq!(
            block_on(method_host.read(&formats)),
            block_on(read_clipboard(&free_host, &formats))
        );
    }

    #[test]
    fn read_format_method_matches_read_clipboard_format() {
        let method_host = formats_host();
        let free_host = formats_host();
        assert_eq!(
            block_on(method_host.read_format(CLIPBOARD_FORMAT_TEXT)),
            block_on(read_clipboard_format(&free_host, CLIPBOARD_FORMAT_TEXT))
        );
    }

    #[test]
    fn read_html_method_matches_read_clipboard_html() {
        let method_host = formats_host();
        let free_host = formats_host();
        assert_eq!(
            block_on(method_host.read_html()),
            block_on(read_clipboard_html(&free_host))
        );
    }

    #[test]
    fn read_rtf_method_matches_read_clipboard_rtf() {
        let method_host = formats_host();
        let free_host = formats_host();
        assert_eq!(
            block_on(method_host.read_rtf()),
            block_on(read_clipboard_rtf(&free_host))
        );
    }

    #[test]
    fn write_method_matches_write_clipboard() {
        let method_host = formats_host();
        let free_host = formats_host();
        let items = [ClipboardWriteItem {
            format: CLIPBOARD_FORMAT_TEXT.to_string(),
            data: "multi".to_string(),
        }];
        assert_eq!(
            block_on(method_host.write(&items)),
            block_on(write_clipboard(&free_host, &items))
        );
    }

    #[test]
    fn write_format_method_matches_write_clipboard_format() {
        let method_host = formats_host();
        let free_host = formats_host();
        assert_eq!(
            block_on(method_host.write_format("application/x-flight", "custom")),
            block_on(write_clipboard_format(
                &free_host,
                "application/x-flight",
                "custom"
            ))
        );
    }

    #[test]
    fn write_html_method_matches_write_clipboard_html() {
        let method_host = formats_host();
        let free_host = formats_host();
        assert_eq!(
            block_on(method_host.write_html("<b>html</b>")),
            block_on(write_clipboard_html(&free_host, "<b>html</b>"))
        );
    }

    #[test]
    fn write_rtf_method_matches_write_clipboard_rtf() {
        let method_host = formats_host();
        let free_host = formats_host();
        assert_eq!(
            block_on(method_host.write_rtf("{\\rtf1 rich}")),
            block_on(write_clipboard_rtf(&free_host, "{\\rtf1 rich}"))
        );
    }

    #[test]
    fn has_image_method_matches_has_clipboard_image() {
        let method_host = image_host();
        let free_host = image_host();
        assert_eq!(
            block_on(method_host.has_image()),
            block_on(has_clipboard_image(&free_host))
        );
    }

    #[test]
    fn read_image_method_matches_read_clipboard_image() {
        let method_host = image_host();
        let free_host = image_host();
        assert_eq!(
            block_on(method_host.read_image()),
            block_on(read_clipboard_image(&free_host))
        );
    }

    #[test]
    fn write_image_method_matches_write_clipboard_image() {
        let method_host = image_host();
        let free_host = image_host();
        assert_eq!(
            block_on(method_host.write_image("data:image/png")),
            block_on(write_clipboard_image(&free_host, "data:image/png"))
        );
    }

    #[test]
    fn clear_method_matches_clear_clipboard() {
        let method_host = text_host();
        let free_host = text_host();
        assert_eq!(
            block_on(method_host.clear()),
            block_on(clear_clipboard(&free_host))
        );
    }

    #[test]
    fn has_text_method_matches_has_clipboard_text() {
        let method_host = text_host();
        let free_host = text_host();
        assert_eq!(
            block_on(method_host.has_text()),
            block_on(has_clipboard_text(&free_host))
        );
    }

    #[test]
    fn read_text_method_matches_read_clipboard_text() {
        let method_host = text_host();
        let free_host = text_host();
        assert_eq!(
            block_on(method_host.read_text()),
            block_on(read_clipboard_text(&free_host))
        );
    }

    #[test]
    fn write_text_method_matches_write_clipboard_text() {
        let method_host = text_host();
        let free_host = text_host();
        assert_eq!(
            block_on(method_host.write_text("plain")),
            block_on(write_clipboard_text(&free_host, "plain"))
        );
    }
}

/// Clears the system clipboard through the host (TS `clearClipboard`). `false` is the host's
/// access-denied sentinel; it is a value, never a throw.
pub async fn clear_clipboard(host_clipboard_text: &HostClipboardTextCapability) -> bool {
    return (host_clipboard_text.clear)().await;
}

/// Returns the formats currently on the clipboard (TS `getClipboardFormats`). An empty list is the
/// access-denied sentinel and is forwarded unchanged.
pub async fn get_clipboard_formats(
    host_clipboard_formats: &HostClipboardFormatsCapability,
) -> Vec<String> {
    return (host_clipboard_formats.get_formats)().await;
}

/// True when the clipboard currently holds a bookmark (TS `hasClipboardBookmark`). `null` is the
/// absence/denied sentinel.
pub async fn has_clipboard_bookmark(
    host_clipboard_bookmark: &HostClipboardBookmarkCapability,
) -> bool {
    return (host_clipboard_bookmark.read_bookmark)().await.is_some();
}

/// True when the given format is currently present (TS `hasClipboardFormat`).
pub async fn has_clipboard_format(
    host_clipboard_formats: &HostClipboardFormatsCapability,
    format: &str,
) -> bool {
    return (host_clipboard_formats.has_format)(format.to_string()).await;
}

/// True when the clipboard currently holds HTML content (TS `hasClipboardHtml`).
pub async fn has_clipboard_html(host_clipboard_formats: &HostClipboardFormatsCapability) -> bool {
    return (host_clipboard_formats.has_format)(CLIPBOARD_FORMAT_HTML.to_string()).await;
}

/// True when the clipboard currently holds an image (TS `hasClipboardImage`).
pub async fn has_clipboard_image(host_clipboard_image: &HostClipboardImageCapability) -> bool {
    return (host_clipboard_image.has_image)().await;
}

/// True when the clipboard currently holds RTF content (TS `hasClipboardRTF`).
pub async fn has_clipboard_rtf(host_clipboard_formats: &HostClipboardFormatsCapability) -> bool {
    return (host_clipboard_formats.has_format)(CLIPBOARD_FORMAT_RTF.to_string()).await;
}

/// True when the clipboard currently holds non-empty text (TS `hasClipboardText`).
pub async fn has_clipboard_text(host_clipboard_text: &HostClipboardTextCapability) -> bool {
    return (host_clipboard_text.has_text)().await;
}

/// Reads multiple formats in one round-trip (TS `readClipboard`). Missing formats are omitted by
/// the provider; the returned record is lookup-only, so insertion order is not preserved.
pub async fn read_clipboard(
    host_clipboard_formats: &HostClipboardFormatsCapability,
    formats: &[String],
) -> HashMap<String, String> {
    return (host_clipboard_formats.read_items)(formats.to_vec()).await;
}

/// Reads a bookmark (title + URL) from the clipboard (TS `readClipboardBookmark`). `None` is the
/// absent or denied sentinel.
pub async fn read_clipboard_bookmark(
    host_clipboard_bookmark: &HostClipboardBookmarkCapability,
) -> Option<ClipboardBookmark> {
    return (host_clipboard_bookmark.read_bookmark)().await;
}

/// Reads an arbitrary format flavor as a string (TS `readClipboardFormat`). The empty string is
/// the absent or denied sentinel.
pub async fn read_clipboard_format(
    host_clipboard_formats: &HostClipboardFormatsCapability,
    format: &str,
) -> String {
    return (host_clipboard_formats.read_format)(format.to_string()).await;
}

/// Reads HTML from the clipboard (TS `readClipboardHtml`). The empty string is the absent or denied
/// sentinel.
pub async fn read_clipboard_html(
    host_clipboard_formats: &HostClipboardFormatsCapability,
) -> String {
    return (host_clipboard_formats.read_html)().await;
}

/// Reads an image from the clipboard as a data URL (TS `readClipboardImage`). The empty string is
/// the absent or denied sentinel.
pub async fn read_clipboard_image(host_clipboard_image: &HostClipboardImageCapability) -> String {
    return (host_clipboard_image.read_image)().await;
}

/// Reads RTF markup from the clipboard (TS `readClipboardRTF`). The empty string is the absent or
/// denied sentinel.
pub async fn read_clipboard_rtf(host_clipboard_formats: &HostClipboardFormatsCapability) -> String {
    return (host_clipboard_formats.read_rtf)().await;
}

/// Reads plain text from the clipboard (TS `readClipboardText`). The empty string is the empty or
/// denied sentinel.
pub async fn read_clipboard_text(host_clipboard_text: &HostClipboardTextCapability) -> String {
    return (host_clipboard_text.read_text)().await;
}

/// Writes multiple formats atomically so a paste target picks its best representation (TS
/// `writeClipboard`). `false` is the access-denied sentinel.
pub async fn write_clipboard(
    host_clipboard_formats: &HostClipboardFormatsCapability,
    items: &[ClipboardWriteItem],
) -> bool {
    return (host_clipboard_formats.write_items)(items.to_vec()).await;
}

/// Writes a bookmark (title + URL) to the clipboard (TS `writeClipboardBookmark`). `false` is the
/// access-denied sentinel.
pub async fn write_clipboard_bookmark(
    host_clipboard_bookmark: &HostClipboardBookmarkCapability,
    title: &str,
    url: &str,
) -> bool {
    return (host_clipboard_bookmark.write_bookmark)(title.to_string(), url.to_string()).await;
}

/// Writes an arbitrary format flavor (TS `writeClipboardFormat`). `false` is the access-denied
/// sentinel.
pub async fn write_clipboard_format(
    host_clipboard_formats: &HostClipboardFormatsCapability,
    format: &str,
    data: &str,
) -> bool {
    return (host_clipboard_formats.write_format)(format.to_string(), data.to_string()).await;
}

/// Writes HTML to the clipboard (TS `writeClipboardHtml`). `false` is the access-denied sentinel.
pub async fn write_clipboard_html(
    host_clipboard_formats: &HostClipboardFormatsCapability,
    html: &str,
) -> bool {
    return (host_clipboard_formats.write_html)(html.to_string()).await;
}

/// Writes an image given as a data URL (TS `writeClipboardImage`). `false` is the access-denied
/// sentinel.
pub async fn write_clipboard_image(
    host_clipboard_image: &HostClipboardImageCapability,
    data_url: &str,
) -> bool {
    return (host_clipboard_image.write_image)(data_url.to_string()).await;
}

/// Writes RTF markup to the clipboard (TS `writeClipboardRTF`). `false` is the access-denied
/// sentinel.
pub async fn write_clipboard_rtf(
    host_clipboard_formats: &HostClipboardFormatsCapability,
    rtf: &str,
) -> bool {
    return (host_clipboard_formats.write_rtf)(rtf.to_string()).await;
}

/// Writes plain text to the clipboard (TS `writeClipboardText`). `false` is the access-denied
/// sentinel.
pub async fn write_clipboard_text(
    host_clipboard_text: &HostClipboardTextCapability,
    text: &str,
) -> bool {
    return (host_clipboard_text.write_text)(text.to_string()).await;
}

// ============================================================================
// D18 sugar: methods on each capability record delegate to the free functions
// ============================================================================

impl HostClipboardBookmarkCapability {
    pub async fn has_bookmark(&self) -> bool {
        return has_clipboard_bookmark(self).await;
    }

    pub async fn read_bookmark(&self) -> Option<ClipboardBookmark> {
        return read_clipboard_bookmark(self).await;
    }

    pub async fn write_bookmark(&self, title: &str, url: &str) -> bool {
        return write_clipboard_bookmark(self, title, url).await;
    }
}

impl HostClipboardFormatsCapability {
    pub async fn get_formats(&self) -> Vec<String> {
        return get_clipboard_formats(self).await;
    }

    pub async fn has_format(&self, format: &str) -> bool {
        return has_clipboard_format(self, format).await;
    }

    pub async fn has_html(&self) -> bool {
        return has_clipboard_html(self).await;
    }

    pub async fn has_rtf(&self) -> bool {
        return has_clipboard_rtf(self).await;
    }

    pub async fn read(&self, formats: &[String]) -> HashMap<String, String> {
        return read_clipboard(self, formats).await;
    }

    pub async fn read_format(&self, format: &str) -> String {
        return read_clipboard_format(self, format).await;
    }

    pub async fn read_html(&self) -> String {
        return read_clipboard_html(self).await;
    }

    pub async fn read_rtf(&self) -> String {
        return read_clipboard_rtf(self).await;
    }

    pub async fn write(&self, items: &[ClipboardWriteItem]) -> bool {
        return write_clipboard(self, items).await;
    }

    pub async fn write_format(&self, format: &str, data: &str) -> bool {
        return write_clipboard_format(self, format, data).await;
    }

    pub async fn write_html(&self, html: &str) -> bool {
        return write_clipboard_html(self, html).await;
    }

    pub async fn write_rtf(&self, rtf: &str) -> bool {
        return write_clipboard_rtf(self, rtf).await;
    }
}

impl HostClipboardImageCapability {
    pub async fn has_image(&self) -> bool {
        return has_clipboard_image(self).await;
    }

    pub async fn read_image(&self) -> String {
        return read_clipboard_image(self).await;
    }

    pub async fn write_image(&self, data_url: &str) -> bool {
        return write_clipboard_image(self, data_url).await;
    }
}

impl HostClipboardTextCapability {
    pub async fn clear(&self) -> bool {
        return clear_clipboard(self).await;
    }

    pub async fn has_text(&self) -> bool {
        return has_clipboard_text(self).await;
    }

    pub async fn read_text(&self) -> String {
        return read_clipboard_text(self).await;
    }

    pub async fn write_text(&self, text: &str) -> bool {
        return write_clipboard_text(self, text).await;
    }
}
