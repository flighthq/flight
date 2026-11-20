use std::fs;
use std::future::Future;
use std::path::Path;
use std::task::{Context, Poll, Waker};

use flight_font_formats::{
    SyntheticFontOptions, create_synthetic_font, empty_synthetic_glyph, square_synthetic_glyph,
};
use flight_host_text::{TextHostOperationExplanation, TextHostOperationExplanationReason};
use flight_host_text::{
    create_text_host, get_text_host_font_variation_axes, load_font_bytes_with_text_host,
};

pub(crate) fn assert_reason(
    explanation: &TextHostOperationExplanation,
    reason: TextHostOperationExplanationReason,
) {
    assert_eq!(explanation.reason, reason, "{}", explanation.message);
    assert_eq!(explanation.message.is_empty(), reason == TextHostOperationExplanationReason::Ready);
}

pub(crate) fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        match future.as_mut().poll(&mut context) {
            Poll::Ready(value) => return value,
            Poll::Pending => std::thread::yield_now(),
        }
    }
}

pub(crate) fn complex_system_font() -> Option<Box<[u8]>> {
    for path in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ] {
        if let Ok(bytes) = fs::read(path) {
            return Some(bytes.into_boxed_slice());
        }
    }
    return None;
}

pub(crate) fn synthetic_font() -> Box<[u8]> {
    return create_synthetic_font(Some(&SyntheticFontOptions {
        advances: Some(vec![500.0, 600.0]),
        codepoints: Some(vec![(65.0, 1.0)]),
        glyphs: Some(vec![empty_synthetic_glyph(), square_synthetic_glyph(700.0)]),
        units_per_em: Some(1_000.0),
        ..SyntheticFontOptions::default()
    }));
}

pub(crate) fn synthetic_font_collection() -> Box<[u8]> {
    let first = synthetic_font().into_vec();
    let second = create_synthetic_font(Some(&SyntheticFontOptions {
        advances: Some(vec![500.0, 900.0]),
        codepoints: Some(vec![(65.0, 1.0)]),
        glyphs: Some(vec![empty_synthetic_glyph(), square_synthetic_glyph(700.0)]),
        units_per_em: Some(1_000.0),
        ..SyntheticFontOptions::default()
    }))
    .into_vec();
    let header_length = 20_usize;
    let first_offset = header_length;
    let second_offset = (first_offset + first.len() + 3) & !3;
    let mut collection = vec![0_u8; second_offset + second.len()];
    collection[..4].copy_from_slice(b"ttcf");
    collection[4..8].copy_from_slice(&0x0001_0000_u32.to_be_bytes());
    collection[8..12].copy_from_slice(&2_u32.to_be_bytes());
    collection[12..16].copy_from_slice(&(first_offset as u32).to_be_bytes());
    collection[16..20].copy_from_slice(&(second_offset as u32).to_be_bytes());
    collection[first_offset..first_offset + first.len()].copy_from_slice(&first);
    collection[second_offset..second_offset + second.len()].copy_from_slice(&second);
    offset_sfnt_tables(&mut collection, first_offset);
    offset_sfnt_tables(&mut collection, second_offset);
    return collection.into_boxed_slice();
}

pub(crate) fn variable_system_font() -> Option<Box<[u8]>> {
    for root in ["/usr/share/fonts", "/usr/local/share/fonts"] {
        let mut paths = Vec::new();
        collect_font_paths(Path::new(root), &mut paths, 2_000);
        paths.sort();
        for path in paths {
            let Ok(bytes) = fs::read(path) else {
                continue;
            };
            let host = create_text_host(None);
            let Some(face) = load_font_bytes_with_text_host(&host, "variable-probe", &bytes, None)
            else {
                continue;
            };
            if !get_text_host_font_variation_axes(&face).is_empty() {
                return Some(bytes.into_boxed_slice());
            }
        }
    }
    return None;
}

fn collect_font_paths(root: &Path, output: &mut Vec<std::path::PathBuf>, limit: usize) {
    if output.len() >= limit {
        return;
    }
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.filter_map(Result::ok) {
        if output.len() >= limit {
            return;
        }
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            collect_font_paths(&path, output, limit);
        } else if path.extension().and_then(|value| value.to_str()).is_some_and(|value| {
            matches!(value.to_ascii_lowercase().as_str(), "otf" | "ttc" | "ttf")
        }) {
            output.push(path);
        }
    }
}

fn offset_sfnt_tables(collection: &mut [u8], face_offset: usize) {
    let table_count = u16::from_be_bytes(
        collection[face_offset + 4..face_offset + 6]
            .try_into()
            .expect("table count"),
    ) as usize;
    for table in 0..table_count {
        let offset_at = face_offset + 12 + table * 16 + 8;
        let relative = u32::from_be_bytes(
            collection[offset_at..offset_at + 4]
                .try_into()
                .expect("table offset"),
        );
        collection[offset_at..offset_at + 4]
            .copy_from_slice(&(relative + face_offset as u32).to_be_bytes());
    }
}
