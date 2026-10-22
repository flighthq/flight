use crate::{SwfParseOptions, SwfTagHandlerRef};

pub fn merge_swf_parse_options(options: &[&SwfParseOptions]) -> SwfParseOptions {
    let mut tags: Vec<SwfTagHandlerRef> = Vec::new();
    let mut deflate = None;
    let mut lzma = None;
    for fragment in options {
        if let Some(fragment_tags) = &fragment.tags {
            tags.extend(fragment_tags.iter().cloned());
        }
        if fragment.deflate.is_some() {
            deflate = fragment.deflate.clone();
        }
        if fragment.lzma.is_some() {
            lzma = fragment.lzma.clone();
        }
    }
    return SwfParseOptions {
        deflate,
        lzma,
        tags: Some(tags),
    };
}
