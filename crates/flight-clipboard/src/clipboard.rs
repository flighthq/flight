use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::test_support::block_on;
    use flight_entity::{
        FlightError, FlightErrorKind, Record, get_record_keys, get_record_value, set_record_value,
    };
    use std::sync::Arc;

    fn bookmark_host() -> HostClipboardBookmarkCapability {
        return HostClipboardBookmarkCapability {
            read_bookmark: Arc::new(|| {
                let future: ClipboardBookmarkFuture = Box::pin(async {
                    Ok(Some(ClipboardBookmark {
                        title: "Flight".to_string(),
                        url: "https://example.com".to_string(),
                    }))
                });
                return future;
            }),
            write_bookmark: Arc::new(|_title: String, _url: String| {
                let future: ClipboardBoolFuture = Box::pin(async { Ok(true) });
                return future;
            }),
        };
    }

    fn formats_host() -> HostClipboardFormatsCapability {
        return HostClipboardFormatsCapability {
            get_formats: Arc::new(|| {
                let future: ClipboardStringsFuture =
                    Box::pin(async { Ok(vec![CLIPBOARD_FORMAT_TEXT.to_string()]) });
                return future;
            }),
            has_format: Arc::new(|format: String| {
                let future: ClipboardBoolFuture =
                    Box::pin(async move { Ok(format == CLIPBOARD_FORMAT_TEXT) });
                return future;
            }),
            read_format: Arc::new(|format: String| {
                let future: ClipboardStringFuture = Box::pin(async move { Ok(format) });
                return future;
            }),
            read_html: Arc::new(|| {
                let future: ClipboardStringFuture =
                    Box::pin(async { Ok("<b>html</b>".to_string()) });
                return future;
            }),
            read_items: Arc::new(|formats: Vec<String>| {
                let future: ClipboardItemsFuture = Box::pin(async move {
                    let mut result: Record<String> = empty_record();
                    for format in formats {
                        set_record_value(&mut result, format.clone(), format);
                    }
                    return Ok(result);
                });
                return future;
            }),
            read_rtf: Arc::new(|| {
                let future: ClipboardStringFuture =
                    Box::pin(async { Ok("{\\rtf1 rich}".to_string()) });
                return future;
            }),
            write_format: Arc::new(|_format: String, _data: String| {
                let future: ClipboardBoolFuture = Box::pin(async { Ok(true) });
                return future;
            }),
            write_html: Arc::new(|_html: String| {
                let future: ClipboardBoolFuture = Box::pin(async { Ok(true) });
                return future;
            }),
            write_items: Arc::new(|_items: Vec<ClipboardWriteItem>| {
                let future: ClipboardBoolFuture = Box::pin(async { Ok(true) });
                return future;
            }),
            write_rtf: Arc::new(|_rtf: String| {
                let future: ClipboardBoolFuture = Box::pin(async { Ok(true) });
                return future;
            }),
        };
    }

    fn image_host() -> HostClipboardImageCapability {
        return HostClipboardImageCapability {
            has_image: Arc::new(|| {
                let future: ClipboardBoolFuture = Box::pin(async { Ok(true) });
                return future;
            }),
            read_image: Arc::new(|| {
                let future: ClipboardStringFuture =
                    Box::pin(async { Ok("data:image/png".to_string()) });
                return future;
            }),
            write_image: Arc::new(|_data_url: String| {
                let future: ClipboardBoolFuture = Box::pin(async { Ok(true) });
                return future;
            }),
        };
    }

    fn text_host() -> HostClipboardTextCapability {
        return HostClipboardTextCapability {
            clear: Arc::new(|| {
                let future: ClipboardBoolFuture = Box::pin(async { Ok(true) });
                return future;
            }),
            has_text: Arc::new(|| {
                let future: ClipboardBoolFuture = Box::pin(async { Ok(true) });
                return future;
            }),
            read_text: Arc::new(|| {
                let future: ClipboardStringFuture = Box::pin(async { Ok("plain".to_string()) });
                return future;
            }),
            write_text: Arc::new(|_text: String| {
                let future: ClipboardBoolFuture = Box::pin(async { Ok(true) });
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
        let via_method = block_on(method_host.read(&formats)).unwrap();
        let via_free = block_on(read_clipboard(&free_host, &formats)).unwrap();
        assert_eq!(get_record_keys(&via_method), get_record_keys(&via_free));
        for key in get_record_keys(&via_method) {
            assert_eq!(
                get_record_value(&via_method, &key),
                get_record_value(&via_free, &key)
            );
        }
    }

    fn empty_record() -> Record<String> {
        let make: fn() -> Record<String> = Record::default;
        return make();
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

    fn rejected() -> FlightError {
        return FlightError {
            kind: FlightErrorKind::Error,
            message: "clipboard rejected".to_string(),
        };
    }

    #[test]
    fn bookmark_methods_propagate_rejection_unchanged() {
        let host = HostClipboardBookmarkCapability {
            read_bookmark: Arc::new(|| {
                let future: ClipboardBookmarkFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
            write_bookmark: Arc::new(|_title: String, _url: String| {
                let future: ClipboardBoolFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
        };
        let error = rejected();
        assert_eq!(block_on(host.has_bookmark()), Err(error.clone()));
        assert_eq!(block_on(host.read_bookmark()), Err(error.clone()));
        assert_eq!(
            block_on(host.write_bookmark("Flight", "https://example.com")),
            Err(error)
        );
    }

    #[test]
    fn formats_methods_propagate_rejection_unchanged() {
        let host = HostClipboardFormatsCapability {
            get_formats: Arc::new(|| {
                let future: ClipboardStringsFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
            has_format: Arc::new(|_format: String| {
                let future: ClipboardBoolFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
            read_format: Arc::new(|_format: String| {
                let future: ClipboardStringFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
            read_html: Arc::new(|| {
                let future: ClipboardStringFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
            read_items: Arc::new(|_formats: Vec<String>| {
                let future: ClipboardItemsFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
            read_rtf: Arc::new(|| {
                let future: ClipboardStringFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
            write_format: Arc::new(|_format: String, _data: String| {
                let future: ClipboardBoolFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
            write_html: Arc::new(|_html: String| {
                let future: ClipboardBoolFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
            write_items: Arc::new(|_items: Vec<ClipboardWriteItem>| {
                let future: ClipboardBoolFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
            write_rtf: Arc::new(|_rtf: String| {
                let future: ClipboardBoolFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
        };
        let error = rejected();
        let formats = [CLIPBOARD_FORMAT_TEXT.to_string()];
        let items = [ClipboardWriteItem {
            format: CLIPBOARD_FORMAT_TEXT.to_string(),
            data: "multi".to_string(),
        }];
        assert_eq!(block_on(host.get_formats()), Err(error.clone()));
        assert_eq!(
            block_on(host.has_format(CLIPBOARD_FORMAT_TEXT)),
            Err(error.clone())
        );
        assert_eq!(block_on(host.has_html()), Err(error.clone()));
        assert_eq!(block_on(host.has_rtf()), Err(error.clone()));
        match block_on(host.read(&formats)) {
            Err(actual) => assert_eq!(actual, error.clone()),
            Ok(_) => panic!("expected the rejection"),
        }
        assert_eq!(
            block_on(host.read_format(CLIPBOARD_FORMAT_TEXT)),
            Err(error.clone())
        );
        assert_eq!(block_on(host.read_html()), Err(error.clone()));
        assert_eq!(block_on(host.read_rtf()), Err(error.clone()));
        assert_eq!(block_on(host.write(&items)), Err(error.clone()));
        assert_eq!(
            block_on(host.write_format("application/x-flight", "custom")),
            Err(error.clone())
        );
        assert_eq!(block_on(host.write_html("<b>html</b>")), Err(error.clone()));
        assert_eq!(block_on(host.write_rtf("{\\rtf1 rich}")), Err(error));
    }

    #[test]
    fn image_methods_propagate_rejection_unchanged() {
        let host = HostClipboardImageCapability {
            has_image: Arc::new(|| {
                let future: ClipboardBoolFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
            read_image: Arc::new(|| {
                let future: ClipboardStringFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
            write_image: Arc::new(|_data_url: String| {
                let future: ClipboardBoolFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
        };
        let error = rejected();
        assert_eq!(block_on(host.has_image()), Err(error.clone()));
        assert_eq!(block_on(host.read_image()), Err(error.clone()));
        assert_eq!(block_on(host.write_image("data:image/png")), Err(error));
    }

    #[test]
    fn text_methods_propagate_rejection_unchanged() {
        let host = HostClipboardTextCapability {
            clear: Arc::new(|| {
                let future: ClipboardBoolFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
            has_text: Arc::new(|| {
                let future: ClipboardBoolFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
            read_text: Arc::new(|| {
                let future: ClipboardStringFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
            write_text: Arc::new(|_text: String| {
                let future: ClipboardBoolFuture = Box::pin(async { Err(rejected()) });
                return future;
            }),
        };
        let error = rejected();
        assert_eq!(block_on(host.clear()), Err(error.clone()));
        assert_eq!(block_on(host.has_text()), Err(error.clone()));
        assert_eq!(block_on(host.read_text()), Err(error.clone()));
        assert_eq!(block_on(host.write_text("plain")), Err(error));
    }
}

/// Clears the system clipboard through the host (TS `clearClipboard`). `false` is the host's
/// access-denied sentinel; it is a value, never a throw.
pub async fn clear_clipboard(
    host_clipboard_text: &HostClipboardTextCapability,
) -> ClipboardBoolResult {
    return (host_clipboard_text.clear)().await;
}

/// Returns the formats currently on the clipboard (TS `getClipboardFormats`). An empty list is the
/// access-denied sentinel and is forwarded unchanged.
pub async fn get_clipboard_formats(
    host_clipboard_formats: &HostClipboardFormatsCapability,
) -> ClipboardStringsResult {
    return (host_clipboard_formats.get_formats)().await;
}

/// True when the clipboard currently holds a bookmark (TS `hasClipboardBookmark`). `null` is the
/// absence/denied sentinel.
pub async fn has_clipboard_bookmark(
    host_clipboard_bookmark: &HostClipboardBookmarkCapability,
) -> ClipboardBoolResult {
    return (host_clipboard_bookmark.read_bookmark)()
        .await
        .map(|bookmark| bookmark.is_some());
}

/// True when the given format is currently present (TS `hasClipboardFormat`).
pub async fn has_clipboard_format(
    host_clipboard_formats: &HostClipboardFormatsCapability,
    format: &str,
) -> ClipboardBoolResult {
    return (host_clipboard_formats.has_format)(format.to_string()).await;
}

/// True when the clipboard currently holds HTML content (TS `hasClipboardHtml`).
pub async fn has_clipboard_html(
    host_clipboard_formats: &HostClipboardFormatsCapability,
) -> ClipboardBoolResult {
    return (host_clipboard_formats.has_format)(CLIPBOARD_FORMAT_HTML.to_string()).await;
}

/// True when the clipboard currently holds an image (TS `hasClipboardImage`).
pub async fn has_clipboard_image(
    host_clipboard_image: &HostClipboardImageCapability,
) -> ClipboardBoolResult {
    return (host_clipboard_image.has_image)().await;
}

/// True when the clipboard currently holds RTF content (TS `hasClipboardRTF`).
pub async fn has_clipboard_rtf(
    host_clipboard_formats: &HostClipboardFormatsCapability,
) -> ClipboardBoolResult {
    return (host_clipboard_formats.has_format)(CLIPBOARD_FORMAT_RTF.to_string()).await;
}

/// True when the clipboard currently holds non-empty text (TS `hasClipboardText`).
pub async fn has_clipboard_text(
    host_clipboard_text: &HostClipboardTextCapability,
) -> ClipboardBoolResult {
    return (host_clipboard_text.has_text)().await;
}

/// Reads multiple formats in one round-trip (TS `readClipboard`). Missing formats are omitted by
/// the provider; the returned `Record` preserves the source's plain-object key semantics (integer
/// indices ascending, then other keys in insertion order).
pub async fn read_clipboard(
    host_clipboard_formats: &HostClipboardFormatsCapability,
    formats: &[String],
) -> ClipboardItemsResult {
    return (host_clipboard_formats.read_items)(formats.to_vec()).await;
}

/// Reads a bookmark (title + URL) from the clipboard (TS `readClipboardBookmark`). `None` is the
/// absent or denied sentinel.
pub async fn read_clipboard_bookmark(
    host_clipboard_bookmark: &HostClipboardBookmarkCapability,
) -> ClipboardBookmarkResult {
    return (host_clipboard_bookmark.read_bookmark)().await;
}

/// Reads an arbitrary format flavor as a string (TS `readClipboardFormat`). The empty string is
/// the absent or denied sentinel.
pub async fn read_clipboard_format(
    host_clipboard_formats: &HostClipboardFormatsCapability,
    format: &str,
) -> ClipboardStringResult {
    return (host_clipboard_formats.read_format)(format.to_string()).await;
}

/// Reads HTML from the clipboard (TS `readClipboardHtml`). The empty string is the absent or denied
/// sentinel.
pub async fn read_clipboard_html(
    host_clipboard_formats: &HostClipboardFormatsCapability,
) -> ClipboardStringResult {
    return (host_clipboard_formats.read_html)().await;
}

/// Reads an image from the clipboard as a data URL (TS `readClipboardImage`). The empty string is
/// the absent or denied sentinel.
pub async fn read_clipboard_image(
    host_clipboard_image: &HostClipboardImageCapability,
) -> ClipboardStringResult {
    return (host_clipboard_image.read_image)().await;
}

/// Reads RTF markup from the clipboard (TS `readClipboardRTF`). The empty string is the absent or
/// denied sentinel.
pub async fn read_clipboard_rtf(
    host_clipboard_formats: &HostClipboardFormatsCapability,
) -> ClipboardStringResult {
    return (host_clipboard_formats.read_rtf)().await;
}

/// Reads plain text from the clipboard (TS `readClipboardText`). The empty string is the empty or
/// denied sentinel.
pub async fn read_clipboard_text(
    host_clipboard_text: &HostClipboardTextCapability,
) -> ClipboardStringResult {
    return (host_clipboard_text.read_text)().await;
}

/// Writes multiple formats atomically so a paste target picks its best representation (TS
/// `writeClipboard`). `false` is the access-denied sentinel.
pub async fn write_clipboard(
    host_clipboard_formats: &HostClipboardFormatsCapability,
    items: &[ClipboardWriteItem],
) -> ClipboardBoolResult {
    return (host_clipboard_formats.write_items)(items.to_vec()).await;
}

/// Writes a bookmark (title + URL) to the clipboard (TS `writeClipboardBookmark`). `false` is the
/// access-denied sentinel.
pub async fn write_clipboard_bookmark(
    host_clipboard_bookmark: &HostClipboardBookmarkCapability,
    title: &str,
    url: &str,
) -> ClipboardBoolResult {
    return (host_clipboard_bookmark.write_bookmark)(title.to_string(), url.to_string()).await;
}

/// Writes an arbitrary format flavor (TS `writeClipboardFormat`). `false` is the access-denied
/// sentinel.
pub async fn write_clipboard_format(
    host_clipboard_formats: &HostClipboardFormatsCapability,
    format: &str,
    data: &str,
) -> ClipboardBoolResult {
    return (host_clipboard_formats.write_format)(format.to_string(), data.to_string()).await;
}

/// Writes HTML to the clipboard (TS `writeClipboardHtml`). `false` is the access-denied sentinel.
pub async fn write_clipboard_html(
    host_clipboard_formats: &HostClipboardFormatsCapability,
    html: &str,
) -> ClipboardBoolResult {
    return (host_clipboard_formats.write_html)(html.to_string()).await;
}

/// Writes an image given as a data URL (TS `writeClipboardImage`). `false` is the access-denied
/// sentinel.
pub async fn write_clipboard_image(
    host_clipboard_image: &HostClipboardImageCapability,
    data_url: &str,
) -> ClipboardBoolResult {
    return (host_clipboard_image.write_image)(data_url.to_string()).await;
}

/// Writes RTF markup to the clipboard (TS `writeClipboardRTF`). `false` is the access-denied
/// sentinel.
pub async fn write_clipboard_rtf(
    host_clipboard_formats: &HostClipboardFormatsCapability,
    rtf: &str,
) -> ClipboardBoolResult {
    return (host_clipboard_formats.write_rtf)(rtf.to_string()).await;
}

/// Writes plain text to the clipboard (TS `writeClipboardText`). `false` is the access-denied
/// sentinel.
pub async fn write_clipboard_text(
    host_clipboard_text: &HostClipboardTextCapability,
    text: &str,
) -> ClipboardBoolResult {
    return (host_clipboard_text.write_text)(text.to_string()).await;
}

// ============================================================================
// D18 sugar: methods on each capability record delegate to the free functions
// ============================================================================

impl HostClipboardBookmarkCapability {
    pub async fn has_bookmark(&self) -> ClipboardBoolResult {
        return has_clipboard_bookmark(self).await;
    }

    pub async fn read_bookmark(&self) -> ClipboardBookmarkResult {
        return read_clipboard_bookmark(self).await;
    }

    pub async fn write_bookmark(&self, title: &str, url: &str) -> ClipboardBoolResult {
        return write_clipboard_bookmark(self, title, url).await;
    }
}

impl HostClipboardFormatsCapability {
    pub async fn get_formats(&self) -> ClipboardStringsResult {
        return get_clipboard_formats(self).await;
    }

    pub async fn has_format(&self, format: &str) -> ClipboardBoolResult {
        return has_clipboard_format(self, format).await;
    }

    pub async fn has_html(&self) -> ClipboardBoolResult {
        return has_clipboard_html(self).await;
    }

    pub async fn has_rtf(&self) -> ClipboardBoolResult {
        return has_clipboard_rtf(self).await;
    }

    pub async fn read(&self, formats: &[String]) -> ClipboardItemsResult {
        return read_clipboard(self, formats).await;
    }

    pub async fn read_format(&self, format: &str) -> ClipboardStringResult {
        return read_clipboard_format(self, format).await;
    }

    pub async fn read_html(&self) -> ClipboardStringResult {
        return read_clipboard_html(self).await;
    }

    pub async fn read_rtf(&self) -> ClipboardStringResult {
        return read_clipboard_rtf(self).await;
    }

    pub async fn write(&self, items: &[ClipboardWriteItem]) -> ClipboardBoolResult {
        return write_clipboard(self, items).await;
    }

    pub async fn write_format(&self, format: &str, data: &str) -> ClipboardBoolResult {
        return write_clipboard_format(self, format, data).await;
    }

    pub async fn write_html(&self, html: &str) -> ClipboardBoolResult {
        return write_clipboard_html(self, html).await;
    }

    pub async fn write_rtf(&self, rtf: &str) -> ClipboardBoolResult {
        return write_clipboard_rtf(self, rtf).await;
    }
}

impl HostClipboardImageCapability {
    pub async fn has_image(&self) -> ClipboardBoolResult {
        return has_clipboard_image(self).await;
    }

    pub async fn read_image(&self) -> ClipboardStringResult {
        return read_clipboard_image(self).await;
    }

    pub async fn write_image(&self, data_url: &str) -> ClipboardBoolResult {
        return write_clipboard_image(self, data_url).await;
    }
}

impl HostClipboardTextCapability {
    pub async fn clear(&self) -> ClipboardBoolResult {
        return clear_clipboard(self).await;
    }

    pub async fn has_text(&self) -> ClipboardBoolResult {
        return has_clipboard_text(self).await;
    }

    pub async fn read_text(&self) -> ClipboardStringResult {
        return read_clipboard_text(self).await;
    }

    pub async fn write_text(&self, text: &str) -> ClipboardBoolResult {
        return write_clipboard_text(self, text).await;
    }
}
