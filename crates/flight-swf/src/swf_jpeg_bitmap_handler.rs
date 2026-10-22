use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

use flight_entity::Ref;
use flight_image::{
    EmbeddedImageResourceReference, EmbeddedImageResourceReferenceValue, ImageResourceReference,
    create_embedded_image_resource_reference,
};
use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_scene2d::Node2DRef;
use flight_texture::{AlphaType, Texture};

use crate::{
    SWF_LOSSLESS_ALPHA_MIME_TYPE, SWF_LOSSLESS_MIME_TYPE, SwfImageDefinition,
    SwfJpegAlphaDefinition, SwfJpegAlphaPayload, SwfReader, SwfTagHandler,
    SwfTagHandlerInstantiation, SwfTagHandlerRef, SwfTagParseResult, SwfTagParseState,
    SwfTagRectangle, acquire_swf_image_texture, create_swf_textured_sprite, read_big_endian_uint16,
    read_big_endian_uint32, resolve_swf_dimension_bounds,
};

pub static SWF_JPEG_BITMAP_HANDLER: LazyLock<SwfTagHandlerRef> = LazyLock::new(|| {
    Arc::new(SwfTagHandler {
        finish_timeline: None,
        instantiate: Some(SwfTagHandlerInstantiation {
            create_placement_node: Some(Arc::new(|parsed, character_id, bounds, _diagnostics| {
                if !parsed.state.images.contains_key(&character_id) {
                    return None;
                }
                let texture = acquire_swf_image_texture(&parsed.state, character_id, false, true);
                let node: Node2DRef =
                    create_swf_textured_sprite(&parsed.state.node_state, &texture, bounds);
                return Some(node);
            })),
            create_resources: Some(Arc::new(|parsed, out| {
                let images = create_swf_image_resources(parsed);
                out.images.extend(images.resources);
                out.jpeg_alpha_payloads
                    .extend(create_swf_jpeg_alpha_payloads(parsed, images.references));
            })),
            has_placement_content: Some(Arc::new(|parsed, character_id| {
                parsed.state.images.contains_key(&character_id)
            })),
        }),
        parse: Arc::new(|body, tag, state, _timeline, _diagnostics| {
            if tag == TAG_JPEG_TABLES {
                let tables = {
                    let source = body.source.read().unwrap();
                    source[body.pos..body.end].to_vec().into_boxed_slice()
                };
                state.jpeg_tables = Some(Arc::new(RwLock::new(tables)));
                return true;
            }
            if tag == TAG_DEFINE_BITS {
                read_swf_legacy_image_definition(body, state);
            } else {
                read_swf_embedded_image_definition(body, state, tag);
            }
            return true;
        }),
        resolve: None,
        tags: vec![
            TAG_DEFINE_BITS,
            TAG_DEFINE_BITS_JPEG_2,
            TAG_DEFINE_BITS_JPEG_3,
            TAG_DEFINE_BITS_JPEG_4,
            TAG_JPEG_TABLES,
        ],
    })
});

struct SwfEmbeddedImage {
    bounds: SwfTagRectangle,
    mime_type: &'static str,
}

struct SwfImageResourceSet {
    references: HashMap<u32, flight_entity::Ref<EmbeddedImageResourceReference>>,
    resources: Vec<ImageResourceReference>,
}

const TAG_DEFINE_BITS: u32 = 6;

const TAG_DEFINE_BITS_JPEG_2: u32 = 21;

const TAG_DEFINE_BITS_JPEG_3: u32 = 35;

const TAG_DEFINE_BITS_JPEG_4: u32 = 90;

const TAG_JPEG_TABLES: u32 = 8;

const GIF_MIME_TYPE: &str = "image/gif";

const JPEG_DEFINE_ARITHMETIC_CODING: u8 = 0xcc;

const JPEG_DEFINE_HUFFMAN_TABLES: u8 = 0xc4;

const JPEG_END_OF_IMAGE: u8 = 0xd9;

const JPEG_MIME_TYPE: &str = "image/jpeg";

const JPEG_EXTENSION: u8 = 0xc8;

const JPEG_START_OF_IMAGE: u8 = 0xd8;

const JPEG_START_OF_SCAN: u8 = 0xda;

const JPEG_TEMPORARY: u8 = 0x01;

const PNG_MIME_TYPE: &str = "image/png";

fn create_swf_image_resources(parsed: &SwfTagParseResult) -> SwfImageResourceSet {
    let mut references = HashMap::new();
    let mut resources = Vec::new();
    let mut character_order = Vec::new();
    let mut textures_by_character = HashMap::<u32, Vec<Ref<Texture>>>::new();
    for (character_id, texture) in parsed.state.image_texture_order.read().unwrap().iter() {
        if !textures_by_character.contains_key(character_id) {
            character_order.push(*character_id);
        }
        textures_by_character
            .entry(*character_id)
            .or_default()
            .push(texture.clone());
    }
    for character_id in character_order {
        let Some(image) = parsed.state.images.get(&character_id) else {
            continue;
        };
        let reference = create_embedded_image_resource_reference(image.bytes.clone());
        {
            let mut reference = reference.write().unwrap();
            reference.alpha_type = if image.mime_type == SWF_LOSSLESS_ALPHA_MIME_TYPE {
                AlphaType::Premultiplied
            } else if image.mime_type == SWF_LOSSLESS_MIME_TYPE {
                AlphaType::Opaque
            } else {
                AlphaType::Straight
            };
            reference.mime_type = Some(image.mime_type.clone());
            reference.textures = textures_by_character
                .remove(&character_id)
                .unwrap_or_default();
        }
        references.insert(character_id, reference.clone());
        resources.push(ImageResourceReference::Embedded(
            EmbeddedImageResourceReferenceValue { reference },
        ));
    }
    return SwfImageResourceSet {
        references,
        resources,
    };
}

fn create_swf_jpeg_alpha_payloads(
    parsed: &SwfTagParseResult,
    mut references: HashMap<u32, flight_entity::Ref<EmbeddedImageResourceReference>>,
) -> Vec<SwfJpegAlphaPayload> {
    let mut payloads = Vec::new();
    for (character_id, source) in &parsed.state.jpeg_alpha_payloads {
        let reference = if let Some(reference) = references.get(character_id) {
            reference.clone()
        } else {
            let Some(image) = parsed.state.images.get(character_id) else {
                continue;
            };
            let reference = create_embedded_image_resource_reference(image.bytes.clone());
            reference.write().unwrap().mime_type = Some(image.mime_type.clone());
            references.insert(*character_id, reference.clone());
            reference
        };
        payloads.push(SwfJpegAlphaPayload {
            character_id: source.character_id,
            compressed_alpha_bytes: source.compressed_alpha_bytes.read().unwrap().clone(),
            deblocking_parameter_raw: source.deblocking_parameter_raw,
            height: source.height,
            reference,
            width: source.width,
        });
    }
    return payloads;
}

fn read_swf_embedded_image(source: &[u8], start: usize, end: usize) -> Option<SwfEmbeddedImage> {
    if end.saturating_sub(start) >= 24
        && source[start..start + 8] == [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
        && read_big_endian_uint32(source, start + 8) == 13
        && source[start + 12..start + 16] == [0x49, 0x48, 0x44, 0x52]
    {
        let bounds = resolve_swf_dimension_bounds(
            read_big_endian_uint32(source, start + 16) as f32,
            read_big_endian_uint32(source, start + 20) as f32,
        )?;
        return Some(SwfEmbeddedImage {
            bounds,
            mime_type: PNG_MIME_TYPE,
        });
    }

    if end.saturating_sub(start) >= 10
        && source[start..start + 4] == [0x47, 0x49, 0x46, 0x38]
        && (source[start + 4] == 0x37 || source[start + 4] == 0x39)
        && source[start + 5] == 0x61
    {
        let bounds = resolve_swf_dimension_bounds(
            f32::from(source[start + 6]) + f32::from(source[start + 7]) * 0x100 as f32,
            f32::from(source[start + 8]) + f32::from(source[start + 9]) * 0x100 as f32,
        )?;
        return Some(SwfEmbeddedImage {
            bounds,
            mime_type: GIF_MIME_TYPE,
        });
    }

    if end.saturating_sub(start) < 4
        || source[start] != 0xff
        || source[start + 1] != JPEG_START_OF_IMAGE
    {
        return None;
    }
    let mut pos = start + 2;
    while pos < end {
        if source[pos] != 0xff {
            return None;
        }
        pos += 1;
        while pos < end && source[pos] == 0xff {
            pos += 1;
        }
        if pos >= end {
            return None;
        }
        let marker = source[pos];
        pos += 1;
        if marker == JPEG_START_OF_SCAN {
            return None;
        }
        if marker == JPEG_END_OF_IMAGE {
            if pos + 1 < end && source[pos] == 0xff && source[pos + 1] == JPEG_START_OF_IMAGE {
                continue;
            }
            return None;
        }
        if marker == JPEG_START_OF_IMAGE
            || marker == JPEG_TEMPORARY
            || (0xd0..=0xd7).contains(&marker)
        {
            continue;
        }
        if pos + 2 > end {
            return None;
        }
        let length = usize::from(read_big_endian_uint16(source, pos));
        if length < 2 || pos + length > end {
            return None;
        }
        if (0xc0..=0xcf).contains(&marker)
            && marker != JPEG_DEFINE_HUFFMAN_TABLES
            && marker != JPEG_EXTENSION
            && marker != JPEG_DEFINE_ARITHMETIC_CODING
        {
            if length < 7 {
                return None;
            }
            let bounds = resolve_swf_dimension_bounds(
                f32::from(read_big_endian_uint16(source, pos + 5)),
                f32::from(read_big_endian_uint16(source, pos + 3)),
            )?;
            return Some(SwfEmbeddedImage {
                bounds,
                mime_type: JPEG_MIME_TYPE,
            });
        }
        pos += length;
    }
    return None;
}

fn read_swf_embedded_image_definition(
    body: &mut SwfReader,
    state: &mut SwfTagParseState,
    code: u32,
) {
    let character_id = u32::from(body.read_uint16());
    let mut deblocking_parameter_raw = None;
    let mut image_start = body.pos;
    let mut image_end = body.end;
    let mut has_alpha_payload = false;
    if code == TAG_DEFINE_BITS_JPEG_3 || code == TAG_DEFINE_BITS_JPEG_4 {
        has_alpha_payload = true;
        let alpha_data_offset = body.read_uint32() as usize;
        let alpha_offset_base = body.pos;
        if code == TAG_DEFINE_BITS_JPEG_4 {
            deblocking_parameter_raw = Some(body.read_uint16());
        }
        image_start = body.pos;
        image_end = alpha_offset_base.saturating_add(alpha_data_offset);
    }
    if !body.valid
        || character_id == 0
        || image_end < image_start
        || image_end > body.end
        || state.defined_characters.contains(&character_id)
    {
        return;
    }
    let source = body.source.read().unwrap();
    let Some(image) = read_swf_embedded_image(&source, image_start, image_end) else {
        return;
    };
    let image_bytes =
        strip_swf_jpeg_stream_boundary(&source, image_start, image_end, image.mime_type);
    let compressed_alpha_bytes =
        has_alpha_payload.then(|| source[image_end..body.end].to_vec().into_boxed_slice());
    drop(source);

    state.defined_characters.insert(character_id);
    state.character_bounds.insert(character_id, image.bounds);
    state.images.insert(
        character_id,
        SwfImageDefinition {
            bytes: Arc::new(RwLock::new(image_bytes)),
            mime_type: image.mime_type.to_string(),
        },
    );
    if let Some(compressed_alpha_bytes) = compressed_alpha_bytes {
        let discarded_bytes = compressed_alpha_bytes.len();
        state.jpeg_alpha_payloads.insert(
            character_id,
            SwfJpegAlphaDefinition {
                character_id,
                compressed_alpha_bytes: Arc::new(RwLock::new(compressed_alpha_bytes)),
                deblocking_parameter_raw,
                height: image.bounds.height as u32,
                width: image.bounds.width as u32,
            },
        );
        if discarded_bytes > 0 {
            report_swf_jpeg_diagnostic(
                state,
                ImportDiagnosticSeverity::Skip,
                "swf.jpeg-alpha-stream",
                "readSwfEmbeddedImageDefinition",
                if code == TAG_DEFINE_BITS_JPEG_3 {
                    "swf.bitmap.define-bits-jpeg-3"
                } else {
                    "swf.bitmap.define-bits-jpeg-4"
                },
                character_id,
                Some(discarded_bytes),
            );
        }
    }
}

fn read_swf_legacy_image_definition(body: &mut SwfReader, state: &mut SwfTagParseState) {
    let character_id = u32::from(body.read_uint16());
    if !body.valid || character_id == 0 || state.defined_characters.contains(&character_id) {
        return;
    }
    let Some(tables) = &state.jpeg_tables else {
        report_swf_jpeg_diagnostic(
            state,
            ImportDiagnosticSeverity::Drop,
            "swf.jpeg-tables-missing",
            "readSwfLegacyImageDefinition",
            "swf.bitmap.define-bits-jpeg-tables",
            character_id,
            None,
        );
        return;
    };
    let tables = tables.read().unwrap();
    let source = body.source.read().unwrap();
    let tables_end = if tables.len() >= 2
        && tables[tables.len() - 2] == 0xff
        && tables[tables.len() - 1] == JPEG_END_OF_IMAGE
    {
        tables.len() - 2
    } else {
        tables.len()
    };
    let image_start = if body.pos + 1 < body.end
        && source[body.pos] == 0xff
        && source[body.pos + 1] == JPEG_START_OF_IMAGE
    {
        body.pos + 2
    } else {
        body.pos
    };
    let mut spliced = Vec::with_capacity(tables_end + body.end.saturating_sub(image_start));
    spliced.extend_from_slice(&tables[..tables_end]);
    spliced.extend_from_slice(&source[image_start..body.end]);
    drop(source);
    drop(tables);

    let Some(image) = read_swf_embedded_image(&spliced, 0, spliced.len()) else {
        report_swf_jpeg_diagnostic(
            state,
            ImportDiagnosticSeverity::Drop,
            "swf.jpeg-tables-unsplittable",
            "readSwfLegacyImageDefinition",
            "swf.bitmap.define-bits-jpeg-tables",
            character_id,
            None,
        );
        return;
    };
    state.defined_characters.insert(character_id);
    state.character_bounds.insert(character_id, image.bounds);
    state.images.insert(
        character_id,
        SwfImageDefinition {
            bytes: Arc::new(RwLock::new(spliced.into_boxed_slice())),
            mime_type: image.mime_type.to_string(),
        },
    );
}

fn report_swf_jpeg_diagnostic(
    state: &SwfTagParseState,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    origin: &str,
    capability: &str,
    character_id: u32,
    discarded_bytes: Option<usize>,
) {
    let Some(diagnostics) = &state.diagnostics else {
        return;
    };
    let mut detail = HashMap::new();
    detail.insert(
        String::from("capability"),
        ImportDiagnosticDetailValue::String(capability.to_string()),
    );
    detail.insert(
        String::from("characterId"),
        ImportDiagnosticDetailValue::Number(character_id as f32),
    );
    if let Some(discarded_bytes) = discarded_bytes {
        detail.insert(
            String::from("discardedBytes"),
            ImportDiagnosticDetailValue::Number(discarded_bytes as f32),
        );
    }
    report_import_diagnostic(
        Some(&mut diagnostics.write().unwrap()),
        severity,
        kind,
        origin,
        Some(detail),
    );
}

fn strip_swf_jpeg_stream_boundary(
    source: &[u8],
    start: usize,
    end: usize,
    mime_type: &str,
) -> Box<[u8]> {
    if mime_type != JPEG_MIME_TYPE {
        return source[start..end].to_vec().into_boxed_slice();
    }
    for pos in start..end.saturating_sub(3) {
        if source[pos] == 0xff
            && source[pos + 1] == JPEG_END_OF_IMAGE
            && source[pos + 2] == 0xff
            && source[pos + 3] == JPEG_START_OF_IMAGE
        {
            let mut spliced = Vec::with_capacity(end - start - 4);
            spliced.extend_from_slice(&source[start..pos]);
            spliced.extend_from_slice(&source[pos + 4..end]);
            return spliced.into_boxed_slice();
        }
    }
    return source[start..end].to_vec().into_boxed_slice();
}
