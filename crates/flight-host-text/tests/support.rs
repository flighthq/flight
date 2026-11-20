use std::fs;
use std::future::Future;
use std::path::Path;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::task::{Context, Poll, Waker};

use flight_font_formats::{
    SfntFontTable, SyntheticFontOptions, SyntheticGlyph, SyntheticGlyphPoint, assemble_sfnt_font,
    create_synthetic_font, empty_synthetic_glyph, encode_synthetic_woff, square_synthetic_glyph,
};
use flight_host_text::{TextHostOperationExplanation, TextHostOperationExplanationReason};

static TEST_DIRECTORY_ID: AtomicUsize = AtomicUsize::new(0);

pub(crate) struct TestDirectory {
    path: PathBuf,
}

impl TestDirectory {
    pub(crate) fn create() -> Self {
        let id = TEST_DIRECTORY_ID.fetch_add(1, Ordering::Relaxed);
        let path =
            std::env::temp_dir().join(format!("flight-host-text-{}-{id}", std::process::id()));
        fs::create_dir(&path).expect("create isolated test directory");
        return Self { path };
    }

    pub(crate) fn path(&self) -> &Path {
        return &self.path;
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.path).expect("remove isolated test directory");
    }
}

pub(crate) fn assert_reason(
    explanation: &TextHostOperationExplanation,
    reason: TextHostOperationExplanationReason,
) {
    assert_eq!(explanation.reason, reason, "{}", explanation.message);
    assert_eq!(
        explanation.message.is_empty(),
        reason == TextHostOperationExplanationReason::Ready
    );
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
    return synthetic_font_with_advance(600.0);
}

pub(crate) fn synthetic_font_with_advance(advance: f32) -> Box<[u8]> {
    return create_synthetic_font(Some(&SyntheticFontOptions {
        advances: Some(vec![500.0, advance]),
        codepoints: Some(vec![(65.0, 1.0)]),
        glyphs: Some(vec![empty_synthetic_glyph(), square_synthetic_glyph(700.0)]),
        units_per_em: Some(1_000.0),
        ..SyntheticFontOptions::default()
    }));
}

pub(crate) fn synthetic_asymmetric_font() -> Box<[u8]> {
    let glyph = SyntheticGlyph {
        end_points: vec![5.0],
        points: vec![
            synthetic_point(0.0, 0.0),
            synthetic_point(500.0, 0.0),
            synthetic_point(500.0, 150.0),
            synthetic_point(150.0, 150.0),
            synthetic_point(150.0, 650.0),
            synthetic_point(0.0, 650.0),
        ],
    };
    return create_synthetic_font(Some(&SyntheticFontOptions {
        advances: Some(vec![500.0, 600.0]),
        codepoints: Some(vec![(76.0, 1.0)]),
        glyphs: Some(vec![empty_synthetic_glyph(), glyph]),
        units_per_em: Some(1_000.0),
        ..SyntheticFontOptions::default()
    }));
}

pub(crate) fn synthetic_space_font() -> Box<[u8]> {
    return create_synthetic_font(Some(&SyntheticFontOptions {
        advances: Some(vec![500.0, 600.0, 300.0]),
        codepoints: Some(vec![(32.0, 2.0), (65.0, 1.0)]),
        glyphs: Some(vec![
            empty_synthetic_glyph(),
            square_synthetic_glyph(700.0),
            empty_synthetic_glyph(),
        ]),
        units_per_em: Some(1_000.0),
        ..SyntheticFontOptions::default()
    }));
}

pub(crate) fn synthetic_language_font() -> Box<[u8]> {
    let base = create_synthetic_font(Some(&SyntheticFontOptions {
        advances: Some(vec![500.0, 600.0, 900.0]),
        codepoints: Some(vec![(65.0, 1.0)]),
        glyphs: Some(vec![
            empty_synthetic_glyph(),
            square_synthetic_glyph(700.0),
            square_synthetic_glyph(800.0),
        ]),
        units_per_em: Some(1_000.0),
        ..SyntheticFontOptions::default()
    }));
    let mut tables = read_sfnt_tables(&base);
    let mut gsub = vec![0_u8; 82];
    put_u16(&mut gsub, 0, 1);
    put_u16(&mut gsub, 4, 10);
    put_u16(&mut gsub, 6, 42);
    put_u16(&mut gsub, 8, 56);
    put_u16(&mut gsub, 10, 1);
    gsub[12..16].copy_from_slice(b"latn");
    put_u16(&mut gsub, 16, 8);
    put_u16(&mut gsub, 18, 10);
    put_u16(&mut gsub, 20, 1);
    gsub[22..26].copy_from_slice(b"TRK ");
    put_u16(&mut gsub, 26, 16);
    put_u16(&mut gsub, 30, u16::MAX);
    put_u16(&mut gsub, 36, u16::MAX);
    put_u16(&mut gsub, 38, 1);
    put_u16(&mut gsub, 40, 0);
    put_u16(&mut gsub, 42, 1);
    gsub[44..48].copy_from_slice(b"locl");
    put_u16(&mut gsub, 48, 8);
    put_u16(&mut gsub, 52, 1);
    put_u16(&mut gsub, 54, 0);
    put_u16(&mut gsub, 56, 1);
    put_u16(&mut gsub, 58, 4);
    put_u16(&mut gsub, 60, 1);
    put_u16(&mut gsub, 64, 1);
    put_u16(&mut gsub, 66, 8);
    put_u16(&mut gsub, 68, 2);
    put_u16(&mut gsub, 70, 8);
    put_u16(&mut gsub, 72, 1);
    put_u16(&mut gsub, 74, 2);
    put_u16(&mut gsub, 76, 1);
    put_u16(&mut gsub, 78, 1);
    put_u16(&mut gsub, 80, 1);
    tables.push(SfntFontTable {
        data: gsub.into_boxed_slice(),
        tag: u32::from_be_bytes(*b"GSUB"),
    });
    return assemble_sfnt_font(0x0001_0000, &tables);
}

pub(crate) fn synthetic_variable_font() -> Box<[u8]> {
    let base = synthetic_font();
    let mut tables = read_sfnt_tables(&base);
    tables.push(SfntFontTable {
        data: fvar_table(),
        tag: u32::from_be_bytes(*b"fvar"),
    });
    tables.push(SfntFontTable {
        data: hvar_table(),
        tag: u32::from_be_bytes(*b"HVAR"),
    });
    tables.push(SfntFontTable {
        data: mvar_table(),
        tag: u32::from_be_bytes(*b"MVAR"),
    });
    tables.push(SfntFontTable {
        data: post_table(),
        tag: u32::from_be_bytes(*b"post"),
    });
    return assemble_sfnt_font(0x0001_0000, &tables);
}

#[cfg(feature = "system-discovery")]
pub(crate) fn synthetic_named_font(family: &str, advance: f32) -> Box<[u8]> {
    let base = synthetic_font_with_advance(advance);
    let mut tables = read_sfnt_tables(&base);
    let encoded: Vec<u8> = family.encode_utf16().flat_map(u16::to_be_bytes).collect();
    let mut name = vec![0_u8; 18 + encoded.len()];
    put_u16(&mut name, 2, 1);
    put_u16(&mut name, 4, 18);
    put_u16(&mut name, 6, 3);
    put_u16(&mut name, 8, 1);
    put_u16(&mut name, 10, 0x0409);
    put_u16(&mut name, 12, 1);
    put_u16(&mut name, 14, encoded.len() as u16);
    name[18..].copy_from_slice(&encoded);
    tables.push(SfntFontTable {
        data: name.into_boxed_slice(),
        tag: u32::from_be_bytes(*b"name"),
    });
    return assemble_sfnt_font(0x0001_0000, &tables);
}

pub(crate) fn synthetic_woff() -> Box<[u8]> {
    let plain = synthetic_font();
    let mut woff = encode_synthetic_woff(&plain, None);
    put_u32(&mut woff, 16, plain.len() as u32);
    return woff;
}

pub(crate) fn synthetic_format_12_font(groups: &[(u32, u32, u32)]) -> Box<[u8]> {
    let base = synthetic_font();
    let mut tables = read_sfnt_tables(&base);
    tables.retain(|table| table.tag != u32::from_be_bytes(*b"cmap"));
    let mut cmap = vec![0_u8; 12 + 16 + groups.len() * 12];
    put_u16(&mut cmap, 2, 1);
    put_u16(&mut cmap, 4, 3);
    put_u16(&mut cmap, 6, 10);
    put_u32(&mut cmap, 8, 12);
    put_u16(&mut cmap, 12, 12);
    put_u32(&mut cmap, 16, (16 + groups.len() * 12) as u32);
    put_u32(&mut cmap, 24, groups.len() as u32);
    for (index, (start, end, glyph)) in groups.iter().copied().enumerate() {
        let at = 28 + index * 12;
        put_u32(&mut cmap, at, start);
        put_u32(&mut cmap, at + 4, end);
        put_u32(&mut cmap, at + 8, glyph);
    }
    tables.push(SfntFontTable {
        data: cmap.into_boxed_slice(),
        tag: u32::from_be_bytes(*b"cmap"),
    });
    return assemble_sfnt_font(0x0001_0000, &tables);
}

pub(crate) fn declared_woff(table_count: u16, original_length: u32) -> Box<[u8]> {
    let directory_end = 44 + usize::from(table_count) * 20;
    let mut bytes = vec![0_u8; directory_end + 4];
    bytes[..4].copy_from_slice(b"wOFF");
    put_u32(&mut bytes, 4, 0x0001_0000);
    let byte_length = bytes.len() as u32;
    put_u32(&mut bytes, 8, byte_length);
    put_u16(&mut bytes, 12, table_count);
    let total = 12_u32
        .saturating_add(u32::from(table_count) * 16)
        .saturating_add(original_length.saturating_mul(u32::from(table_count)));
    put_u32(&mut bytes, 16, total);
    for index in 0..usize::from(table_count) {
        let at = 44 + index * 20;
        put_u32(&mut bytes, at, 0x7400_0000 + index as u32);
        put_u32(&mut bytes, at + 4, directory_end as u32);
        put_u32(&mut bytes, at + 8, 4);
        put_u32(&mut bytes, at + 12, original_length);
    }
    return bytes.into_boxed_slice();
}

fn synthetic_point(x: f32, y: f32) -> SyntheticGlyphPoint {
    return SyntheticGlyphPoint {
        on_curve: true,
        x,
        y,
    };
}

fn read_sfnt_tables(bytes: &[u8]) -> Vec<SfntFontTable> {
    let count = usize::from(read_u16(bytes, 4));
    return (0..count)
        .map(|index| {
            let record = 12 + index * 16;
            let tag = read_u32(bytes, record);
            let offset = read_u32(bytes, record + 8) as usize;
            let length = read_u32(bytes, record + 12) as usize;
            return SfntFontTable {
                data: bytes[offset..offset + length].to_vec().into_boxed_slice(),
                tag,
            };
        })
        .collect();
}

fn fvar_table() -> Box<[u8]> {
    let mut bytes = vec![0_u8; 36];
    put_u32(&mut bytes, 0, 0x0001_0000);
    put_u16(&mut bytes, 4, 16);
    put_u16(&mut bytes, 6, 2);
    put_u16(&mut bytes, 8, 1);
    put_u16(&mut bytes, 10, 20);
    put_u16(&mut bytes, 12, 0);
    put_u16(&mut bytes, 14, 8);
    bytes[16..20].copy_from_slice(b"wght");
    put_u32(&mut bytes, 20, 0x0001_0000);
    put_u32(&mut bytes, 24, 0x0002_0000);
    put_u32(&mut bytes, 28, 0x0003_0000);
    put_u16(&mut bytes, 34, 256);
    return bytes.into_boxed_slice();
}

fn hvar_table() -> Box<[u8]> {
    let store = variation_store(&[0, 300]);
    let mut bytes = vec![0_u8; 20];
    put_u32(&mut bytes, 0, 0x0001_0000);
    put_u32(&mut bytes, 4, 20);
    bytes.extend_from_slice(&store);
    return bytes.into_boxed_slice();
}

fn mvar_table() -> Box<[u8]> {
    let store = variation_store(&[200]);
    let mut bytes = vec![0_u8; 20];
    put_u32(&mut bytes, 0, 0x0001_0000);
    put_u16(&mut bytes, 6, 8);
    put_u16(&mut bytes, 8, 1);
    put_u16(&mut bytes, 10, 20);
    bytes[12..16].copy_from_slice(b"undo");
    bytes.extend_from_slice(&store);
    return bytes.into_boxed_slice();
}

fn post_table() -> Box<[u8]> {
    let mut bytes = vec![0_u8; 32];
    put_u32(&mut bytes, 0, 0x0003_0000);
    bytes[8..10].copy_from_slice(&(-100_i16).to_be_bytes());
    bytes[10..12].copy_from_slice(&50_i16.to_be_bytes());
    return bytes.into_boxed_slice();
}

fn variation_store(deltas: &[i16]) -> Vec<u8> {
    let mut bytes = vec![0_u8; 30 + deltas.len() * 2];
    put_u16(&mut bytes, 0, 1);
    put_u32(&mut bytes, 2, 12);
    put_u16(&mut bytes, 6, 1);
    put_u32(&mut bytes, 8, 22);
    put_u16(&mut bytes, 12, 1);
    put_u16(&mut bytes, 14, 1);
    put_u16(&mut bytes, 18, 0x4000);
    put_u16(&mut bytes, 20, 0x4000);
    put_u16(&mut bytes, 22, deltas.len() as u16);
    put_u16(&mut bytes, 24, 1);
    put_u16(&mut bytes, 26, 1);
    for (index, delta) in deltas.iter().copied().enumerate() {
        bytes[30 + index * 2..32 + index * 2].copy_from_slice(&delta.to_be_bytes());
    }
    return bytes;
}

fn put_u16(bytes: &mut [u8], at: usize, value: u16) {
    bytes[at..at + 2].copy_from_slice(&value.to_be_bytes());
}

fn put_u32(bytes: &mut [u8], at: usize, value: u32) {
    bytes[at..at + 4].copy_from_slice(&value.to_be_bytes());
}

fn read_u16(bytes: &[u8], at: usize) -> u16 {
    return u16::from_be_bytes(bytes[at..at + 2].try_into().expect("u16"));
}

fn read_u32(bytes: &[u8], at: usize) -> u32 {
    return u32::from_be_bytes(bytes[at..at + 4].try_into().expect("u32"));
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
