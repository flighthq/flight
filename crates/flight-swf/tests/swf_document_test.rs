use crate::support::{
    SwfBitWriter, TAG_DEFINE_SHAPE, TAG_END, TAG_SHOW_FRAME, block_on, bytes_ref,
    create_bitmap_shape_bytes, create_box_glyph_bytes, create_color_transform,
    create_color_transform_with_alpha, create_gif_header, create_jpeg_header, create_matrix_record,
    create_png_header, create_rectangle_record, create_solid_shape_bytes, create_swf, create_tag,
    encoded_uint32, join_bytes, lossless_payload, pack_glyph_entry, stored_deflate, uint16, uint32,
};
use flight_audio::{AudioResourceReference, EmbeddedAudioResourceReference};
use flight_bitmap::{BITMAP_TEXTURE_SOURCE_KIND, Bitmap, create_bitmap};
use flight_compression::{
    CompressionFraming, HostDecompressDeflateCapability, SDK_HOST_DECOMPRESS_DEFLATE,
};
use flight_effects::ADVANCED_BLEND_MODE_OVERLAY;
use flight_font::allocate_glyph_rasterizer_backend_from_glyph_outline_source;
use flight_glyphatlas::{
    GlyphAtlasOptions, create_glyph_atlas, get_glyph_atlas_bitmap, get_glyph_atlas_entry,
};
use flight_image::{EmbeddedImageResourceReference, ImageResourceReference};
use flight_image_codec::ImageDecodeOptions;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_materials::{BLEND_MODE_MULTIPLY, BLEND_MODE_NORMAL};
use flight_movieclip::{MOVIE_CLIP_KIND, MovieClip};
use flight_node::contract::NodeRevisionState;
use flight_node::{
    Node, NodeRef, get_node_children, get_node_color_adjustments, get_node_local_bounds_rectangle,
    get_node_local_matrix, get_node_parent, get_node_runtime, get_node_world_matrix,
};
use flight_scene2d::{DISPLAY_OBJECT_KIND, Node2D, SPRITE_KIND, Sprite, as_node2d_ref};
use flight_scene2d_resources::{
    create_scene2d_document, create_scene2d_document_importer_registry,
};
use flight_shape::contract::{MORPH_SHAPE_KIND, SCALE9_SHAPE_KIND, SHAPE_KIND};
use flight_shape::{MorphShape, Scale9Shape, Shape, ShapeCommandToken};
use flight_swf::contract::*;
use flight_text::{RICH_TEXT_KIND, RichText};
use flight_textformat::TextFormatAlign;
use flight_texture::{
    AlphaType, TextureDimension, TextureFilter, TextureSourceRef, TextureUvTransform,
    TextureVariant, TextureWrap, get_texture_source, set_texture_source,
};
use flight_timeline::contract::{TimelineAudioCue, TimelineCue};
use flight_timeline::{
    TimelineFrameArg, TimelinePlayMode, TimelineRef, get_timeline_current_label,
    goto_and_stop_timeline, play_timeline, update_timeline,
};

fn options() -> SwfParseOptions {
    return SwfParseOptions {
        deflate: None,
        lzma: None,
        tags: Some(SWF_ALL_TAG_HANDLERS.clone()),
    };
}

fn empty_swf() -> flight_entity::Ref<Box<flight_entity::Uint8Array>> {
    return create_swf(
        &[create_tag(TAG_SHOW_FRAME, &[]), create_tag(TAG_END, &[])],
        24.0,
        [0, 2000, 0, 1000],
    );
}

fn exported_symbol_swf() -> flight_entity::Ref<Box<flight_entity::Uint8Array>> {
    let face = join_bytes(&[
        &uint16(7),
        &create_rectangle_record(0, 600, 0, 600),
        &create_solid_shape_bytes(0x203040, &[(600, 0)]),
    ]);
    let child = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(7), b"art\0"]);
    let sprite = join_bytes(&[
        &uint16(20),
        &uint16(1),
        &create_tag(26, &child),
        &create_tag(TAG_SHOW_FRAME, &[]),
        &create_tag(TAG_END, &[]),
    ]);
    let export = join_bytes(&[&uint16(1), &uint16(20), b"Layout\0"]);
    return create_swf(
        &[
            create_tag(TAG_DEFINE_SHAPE, &face),
            create_tag(39, &sprite),
            create_tag(56, &export),
            create_tag(TAG_SHOW_FRAME, &[]),
            create_tag(TAG_END, &[]),
        ],
        24.0,
        [0, 2000, 0, 1000],
    );
}

fn root_timeline(
    document: &flight_entity::Ref<flight_scene2d_resources::Scene2DDocument>,
) -> TimelineRef {
    let root = document.read().unwrap().root.clone();
    return root
        .read()
        .unwrap()
        .as_any()
        .downcast_ref::<MovieClip>()
        .unwrap()
        .data
        .timeline
        .clone()
        .unwrap();
}

fn movie_clip_timeline(node: &NodeRef) -> TimelineRef {
    return node
        .read()
        .unwrap()
        .as_any()
        .downcast_ref::<MovieClip>()
        .unwrap()
        .data
        .timeline
        .clone()
        .unwrap();
}

fn node_revisions() -> NodeRevisionState {
    return NodeRevisionState {
        world_transform_revision: 0,
    };
}

fn embedded_audio_reference(
    document: &flight_entity::Ref<flight_scene2d_resources::Scene2DDocument>,
    index: usize,
) -> flight_entity::Ref<EmbeddedAudioResourceReference> {
    let reference = document.read().unwrap().audio_resources[index].clone();
    let AudioResourceReference::Embedded(value) = reference else {
        panic!("expected an embedded audio resource");
    };
    return value.reference;
}

fn root_timeline_cues(
    document: &flight_entity::Ref<flight_scene2d_resources::Scene2DDocument>,
) -> std::sync::Arc<Vec<flight_entity::Ref<dyn TimelineCue>>> {
    let timeline = root_timeline(document);
    let source = timeline.read().unwrap().source.clone().unwrap();
    return source.read().unwrap().cues.clone();
}

fn embedded_image_reference(
    document: &flight_entity::Ref<flight_scene2d_resources::Scene2DDocument>,
    index: usize,
) -> flight_entity::Ref<EmbeddedImageResourceReference> {
    let reference = document.read().unwrap().image_resources[index].clone();
    let ImageResourceReference::Embedded(value) = reference else {
        panic!("expected an embedded image resource");
    };
    return value.reference;
}

fn first_shape_texture(
    document: &flight_entity::Ref<flight_scene2d_resources::Scene2DDocument>,
) -> flight_entity::Ref<flight_texture::Texture> {
    let root: NodeRef = document.read().unwrap().root.clone();
    let mut children = Vec::new();
    get_node_children(&mut children, &root);
    return shape_texture(&children[0]);
}

fn shape_texture(node: &NodeRef) -> flight_entity::Ref<flight_texture::Texture> {
    let node = node.read().unwrap();
    let shape = node.as_any().downcast_ref::<Shape>().unwrap();
    return shape
        .data
        .commands
        .iter()
        .find_map(|token| match token {
            ShapeCommandToken::Texture(texture) => Some(texture.clone()),
            _ => None,
        })
        .unwrap();
}

fn mp3() -> [u8; 4] {
    return [0xff, 0xfb, 0x90, 0x44];
}

fn morph_box(width: i32) -> Vec<u8> {
    let mut writer = SwfBitWriter::new();
    writer.write_unsigned(2, 4);
    writer.write_unsigned(2, 4);
    writer.write_unsigned(0, 1);
    writer.write_unsigned(0, 1);
    writer.write_unsigned(0, 1);
    writer.write_unsigned(1, 1);
    writer.write_unsigned(0, 1);
    writer.write_unsigned(1, 1);
    writer.write_unsigned(2, 5);
    writer.write_signed(0, 2);
    writer.write_signed(0, 2);
    writer.write_unsigned(1, 2);
    for (delta_x, delta_y) in [(width, 0), (0, width), (-width, 0), (0, -width)] {
        let bits = shape_signed_bit_count(&[delta_x, delta_y]);
        writer.write_unsigned(1, 1);
        writer.write_unsigned(1, 1);
        writer.write_unsigned(u32::from(bits - 2), 4);
        writer.write_unsigned(1, 1);
        writer.write_signed(delta_x, bits);
        writer.write_signed(delta_y, bits);
    }
    writer.write_unsigned(0, 1);
    writer.write_unsigned(0, 5);
    writer.align();
    return writer.to_bytes();
}

fn shape_signed_bit_count(values: &[i32]) -> u8 {
    for bits in 2..32 {
        let minimum = -(1_i64 << (bits - 1));
        let maximum = (1_i64 << (bits - 1)) - 1;
        if values
            .iter()
            .all(|value| i64::from(*value) >= minimum && i64::from(*value) <= maximum)
        {
            return bits;
        }
    }
    return 32;
}

fn resolve_lossless_images(
    document: &flight_entity::Ref<flight_scene2d_resources::Scene2DDocument>,
) {
    let references = document.read().unwrap().image_resources.clone();
    for reference in references {
        let ImageResourceReference::Embedded(value) = reference else {
            continue;
        };
        let (bytes, mime_type, alpha_type, textures) = {
            let reference = value.reference.read().unwrap();
            (
                reference.bytes.read().unwrap().to_vec(),
                reference.mime_type.clone().unwrap(),
                reference.alpha_type,
                reference.textures.clone(),
            )
        };
        let options = ImageDecodeOptions {
            premultiply_alpha: (alpha_type == AlphaType::Premultiplied).then_some(true),
        };
        let decoded = block_on(decode_swf_image(
            &bytes,
            &mime_type,
            &SDK_HOST_DECOMPRESS_DEFLATE,
            Some(&options),
        ))
        .unwrap();
        let mut bitmap = create_bitmap(decoded.width as u32, decoded.height as u32, None);
        bitmap.alpha_type = alpha_type;
        bitmap.data = decoded.data;
        let bitmap = std::sync::Arc::new(std::sync::RwLock::new(bitmap));
        let source: TextureSourceRef = bitmap;
        for texture in textures {
            set_texture_source(&mut *texture.write().unwrap(), Some(source.clone()));
        }
        value.reference.write().unwrap().state = flight_resource::ResourceResolutionState::Resolved;
    }
}

mod create_glyph_outline_sources_from_swf {
    use super::*;

    #[test]
    fn funnels_a_define_font_two_outline_and_code_table_through_the_font_adapter_into_glyphatlas() {
        let glyph = create_box_glyph_bytes(256);
        let offsets = join_bytes(&[&uint16(4), &uint16((4 + glyph.len()) as u16)]);
        let font = join_bytes(&[
            &uint16(4),
            &[0x80, 0, 0],
            &uint16(1),
            &offsets,
            &glyph,
            &[0x41],
            &uint16(800),
            &uint16(200),
            &uint16(50),
            &uint16(600),
            &create_rectangle_record(0, 256, 0, 256),
            &uint16(0),
        ]);
        let source = create_swf(
            &[create_tag(48, &font), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );

        let sources = create_glyph_outline_sources_from_swf(&source, &options(), None).unwrap();
        let outline = sources.get(&4).unwrap();
        let atlas = create_glyph_atlas(&GlyphAtlasOptions {
            font_family: String::from("embedded-swf"),
            font_size: 32.0,
            font_style: None,
            font_weight: None,
            height: 64,
            max_area: None,
            max_bytes: None,
            max_glyphs: None,
            padding: None,
            rasterizer_backend: allocate_glyph_rasterizer_backend_from_glyph_outline_source(
                outline.clone(),
            ),
            width: 64,
        });
        let entry = get_glyph_atlas_entry(&atlas, 0x41).unwrap();

        assert_eq!(sources.len(), 1);
        assert_eq!((outline.get_glyph_outline_index_for_code_point)(0x41), 0);
        assert_eq!(entry.read().unwrap().advance, 18.75);
        assert!(
            get_glyph_atlas_bitmap(&atlas)
                .read()
                .unwrap()
                .data
                .chunks_exact(4)
                .any(|pixel| pixel[3] > 0)
        );
    }

    #[test]
    fn composes_a_legacy_define_font_with_its_separate_define_font_info_code_table() {
        let glyph = create_box_glyph_bytes(256);
        let font = join_bytes(&[&uint16(4), &uint16(2), &glyph]);
        let font_info = join_bytes(&[&uint16(4), &[0, 0, 0x41]]);
        let source = create_swf(
            &[
                create_tag(13, &font_info),
                create_tag(10, &font),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let sources = create_glyph_outline_sources_from_swf(&source, &options(), None).unwrap();
        let outline = sources.get(&4).unwrap();
        assert_eq!((outline.get_glyph_outline_index_for_code_point)(0x41), 0);
        assert_eq!((outline.get_glyph_outline_index_for_code_point)(0x42), -1);
    }

    #[test]
    fn returns_an_empty_map_for_a_file_without_embedded_fonts() {
        let sources =
            create_glyph_outline_sources_from_swf(&empty_swf(), &options(), None).unwrap();
        assert!(sources.is_empty());
    }
}

mod create_scene2d_from_swf {
    use super::*;

    #[test]
    fn raises_no_data_integrity_diagnostic_for_a_well_formed_file() {
        let symbol_class = join_bytes(&[&uint16(1), &uint16(7), b"Game.Avatar\0"]);
        let placement = join_bytes(&[
            &[0x20 | 0x04 | 0x02],
            &uint16(3),
            &uint16(7),
            &create_matrix_record(1.5, 0.25, -0.125, 0.5, 200, -40),
            b"avatarSlot\0",
        ]);
        let source = create_swf(
            &[
                create_tag(69, &[0; 4]),
                create_tag(76, &symbol_class),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.severity == ImportDiagnosticSeverity::Skip)
        );
    }

    #[test]
    fn records_nothing_when_the_caller_engages_no_diagnostic_collector() {
        let source = bytes_ref(vec![0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
        assert!(create_scene2d_from_swf(&source, &options(), None).is_none());
        let diagnostics = Vec::<flight_importdiagnostics::ImportDiagnostic>::new();
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn reports_a_declined_video_frame_as_a_skip() {
        let video = join_bytes(&[&uint16(4), &uint16(1), &uint16(16), &uint16(16), &[0x01, 2]]);
        let frame = join_bytes(&[&uint16(4), &uint16(0), &[0, 0, 0, 0]]);
        let source = create_swf(
            &[
                create_tag(60, &video),
                create_tag(61, &frame),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let declined = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.video-frame-payload")
            .collect::<Vec<_>>();
        assert_eq!(declined.len(), 1);
        assert_eq!(declined[0].severity, ImportDiagnosticSeverity::Skip);
        let detail = declined[0].detail.as_ref().unwrap();
        assert_eq!(detail.len(), 2);
        assert_eq!(
            detail.get("capability"),
            Some(&ImportDiagnosticDetailValue::String(String::from(
                "swf.video.video-frame"
            )))
        );
        assert_eq!(
            detail.get("tag"),
            Some(&ImportDiagnosticDetailValue::Number(61.0))
        );
    }

    #[test]
    fn reports_an_unreadable_container_as_a_reject_naming_the_refusing_check() {
        let source = bytes_ref(vec![0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_none());
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "swf.invalid-signature");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Reject);
        assert_eq!(diagnostics[0].origin, "uncompressSwfSource");
    }

    #[test]
    fn separates_an_absent_deflate_slot_from_a_corrupt_body() {
        let source = create_swf(
            &[create_tag(TAG_SHOW_FRAME, &[]), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );
        let compressed = {
            let mut compressed = source.read().unwrap().to_vec();
            compressed[0] = 0x43;
            bytes_ref(compressed)
        };

        let mut unregistered_options = options();
        unregistered_options.deflate = Some(None);
        let mut unregistered = Vec::new();
        assert!(
            create_scene2d_from_swf(&compressed, &unregistered_options, Some(&mut unregistered))
                .is_none()
        );
        assert!(unregistered.is_empty());

        let mut failing_options = options();
        failing_options.deflate = Some(Some(HostDecompressDeflateCapability {
            decompress: std::sync::Arc::new(|_body, _length, _framing| None),
        }));
        let mut failed = Vec::new();
        assert!(
            create_scene2d_from_swf(&compressed, &failing_options, Some(&mut failed)).is_none()
        );
        assert_eq!(failed.len(), 1);
        assert_eq!(failed[0].kind, "swf.decompression-failed");
        assert_eq!(failed[0].severity, ImportDiagnosticSeverity::Reject);
    }

    #[test]
    fn stays_silent_on_metadata_tags() {
        let source = create_swf(
            &[
                create_tag(69, &[0, 0, 0, 0]),
                create_tag(77, b"<rdf/>\0"),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn reports_an_unreadable_shape_body_as_a_recover() {
        let shape = join_bytes(&[&uint16(1), &create_rectangle_record(0, 20, 0, 20), &[0xff]]);
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let recovered = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.shape-body-unreadable")
            .collect::<Vec<_>>();
        assert_eq!(recovered.len(), 1);
        assert_eq!(recovered[0].severity, ImportDiagnosticSeverity::Recover);
        assert_eq!(
            recovered[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from("swf.shape.define-shape")),
                ),
                (
                    String::from("characterId"),
                    ImportDiagnosticDetailValue::Number(1.0),
                ),
                (
                    String::from("version"),
                    ImportDiagnosticDetailValue::Number(1.0),
                ),
            ])
        );
    }

    #[test]
    fn reports_a_morph_definition_that_does_not_decode() {
        let body = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 200, 0, 200),
            &create_rectangle_record(0, 400, 0, 400),
            &uint32(0xffff),
            &[0],
        ]);
        let source = create_swf(
            &[create_tag(46, &body), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.morph-shape-undecodable")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from(
                        "swf.morph.define-morph-shape",
                    )),
                ),
                (
                    String::from("characterId"),
                    ImportDiagnosticDetailValue::Number(7.0),
                ),
            ])
        );
    }

    #[test]
    fn stays_silent_about_a_morph_definition_that_decodes() {
        let start_edges = morph_box(200);
        let end_edges = morph_box(400);
        let styles = join_bytes(&[
            &[1, 0x00, 0xff, 0x00, 0x00, 0xff, 0x00, 0x00, 0xff, 0xff],
            &[0],
        ]);
        let body = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 200, 0, 200),
            &create_rectangle_record(0, 400, 0, 400),
            &uint32((styles.len() + start_edges.len()) as u32),
            &styles,
            &start_edges,
            &end_edges,
        ]);
        let source = create_swf(
            &[create_tag(46, &body), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.morph-shape-undecodable")
        );
    }

    #[test]
    fn reports_a_static_text_body_that_does_not_compose() {
        let mut record = SwfBitWriter::new();
        record.write_unsigned(1, 1);
        record.write_unsigned(0, 3);
        record.write_unsigned(1, 1);
        record.write_unsigned(1, 1);
        record.write_unsigned(0, 1);
        record.write_unsigned(0, 1);
        let text = join_bytes(&[
            &uint16(6),
            &create_rectangle_record(0, 1024, 0, 1024),
            &create_matrix_record(1.0, 0.0, 0.0, 1.0, 0, 0),
            &[4, 8],
            &record.to_bytes(),
        ]);
        let source = create_swf(
            &[create_tag(11, &text), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.text-shape-uncomposable")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from("swf.text.define-text")),
                ),
                (
                    String::from("characterId"),
                    ImportDiagnosticDetailValue::Number(6.0),
                ),
            ])
        );
    }

    #[test]
    fn stays_silent_about_a_static_text_body_that_composes() {
        let glyph = vec![0x30, 0x28, 0x00, 0x00, 0x40, 0x00];
        let font = join_bytes(&[&uint16(4), &uint16(2), &glyph]);
        let mut record = SwfBitWriter::new();
        record.write_unsigned(1, 1);
        record.write_unsigned(0, 3);
        record.write_unsigned(1, 1);
        record.write_unsigned(1, 1);
        record.write_unsigned(0, 1);
        record.write_unsigned(0, 1);
        let text = join_bytes(&[
            &uint16(6),
            &create_rectangle_record(0, 1024, 0, 1024),
            &create_matrix_record(1.0, 0.0, 0.0, 1.0, 0, 0),
            &[4, 8],
            &record.to_bytes(),
            &uint16(4),
            &[0xff, 0x00, 0x00],
            &uint16(1024),
            &[1],
            &pack_glyph_entry(0, 600),
            &[0],
        ]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(6)]);
        let source = create_swf(
            &[
                create_tag(10, &font),
                create_tag(11, &text),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        let document =
            create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        assert_eq!(children.len(), 1);
        assert_eq!(children[0].read().unwrap().node_fields().kind, SHAPE_KIND);
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.text-shape-uncomposable")
        );
    }

    #[test]
    fn reports_an_edit_text_body_that_does_not_parse() {
        let field = join_bytes(&[
            &uint16(12),
            &create_rectangle_record(0, 4000, 0, 800),
            &[0x80 | 0x01, 0x00],
        ]);
        let source = create_swf(
            &[create_tag(37, &field), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.edit-text-unparseable")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from("swf.text.define-edit-text",)),
                ),
                (
                    String::from("characterId"),
                    ImportDiagnosticDetailValue::Number(12.0),
                ),
            ])
        );
    }

    #[test]
    fn stays_silent_about_an_edit_text_body_that_parses() {
        let field = join_bytes(&[
            &uint16(12),
            &create_rectangle_record(0, 4000, 0, 800),
            &[0x80 | 0x40 | 0x20 | 0x04 | 0x01, 0x20 | 0x08],
            &uint16(7),
            &uint16(240),
            &[0x11, 0x22, 0x33, 0xff],
            &[2],
            &uint16(20),
            &uint16(40),
            &uint16(60),
            &uint16(80),
            b"varName\0",
            b"Hello\0",
        ]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(12)]);
        let source = create_swf(
            &[
                create_tag(37, &field),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        let document =
            create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        assert_eq!(children.len(), 1);
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.edit-text-unparseable")
        );
    }

    #[test]
    fn reports_a_named_abc_blob_that_yields_no_frame_scripts() {
        let named = join_bytes(&[&uint32(0), b"frame\0", &[0xff, 0xff, 0xff, 0xff]]);
        let source = create_swf(
            &[create_tag(82, &named), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.abc-frame-scripts-unreadable")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([(
                String::from("capability"),
                ImportDiagnosticDetailValue::String(String::from("swf.script.do-abc")),
            )])
        );
    }

    #[test]
    fn names_the_anonymous_abc_form_separately() {
        let source = create_swf(
            &[
                create_tag(72, &[0xff, 0xff, 0xff, 0xff]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.abc-frame-scripts-unreadable")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([(
                String::from("capability"),
                ImportDiagnosticDetailValue::String(String::from("swf.script.do-abc-anonymous",)),
            )])
        );
    }

    #[test]
    fn reports_a_declared_blend_mode_left_behind_unread_filters() {
        let placement = join_bytes(&[
            &[0x20 | 0x02, 0x01 | 0x02],
            &uint16(3),
            &uint16(7),
            b"filtered\0",
            &[1, 0xff],
            &[3],
        ]);
        let source = create_swf(
            &[
                create_tag(70, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.blend-mode-behind-unread-filters")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([(
                String::from("capability"),
                ImportDiagnosticDetailValue::String(String::from("swf.placement.blend-mode")),
            )])
        );
    }

    #[test]
    fn stays_silent_when_a_declared_blend_mode_is_reachable() {
        let placement = join_bytes(&[
            &[0x20 | 0x02, 0x02],
            &uint16(3),
            &uint16(7),
            b"multiplied\0",
            &[3],
        ]);
        let source = create_swf(
            &[
                create_tag(70, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        let document =
            create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).unwrap();
        let target: NodeRef = document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        assert_eq!(
            as_node2d_ref(&target)
                .unwrap()
                .read()
                .unwrap()
                .node2d_fields()
                .blend_mode
                .as_deref(),
            Some(BLEND_MODE_MULTIPLY),
        );
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.blend-mode-behind-unread-filters")
        );
    }

    #[test]
    fn counts_children_a_sprite_bounds_union_cannot_include() {
        let shape = join_bytes(&[&uint16(7), &create_rectangle_record(0, 200, 0, 100)]);
        let child = join_bytes(&[&[0x02], &uint16(1), &uint16(7)]);
        let missing = join_bytes(&[&[0x02], &uint16(2), &uint16(9)]);
        let sprite = join_bytes(&[
            &uint16(20),
            &uint16(1),
            &create_tag(26, &child),
            &create_tag(26, &missing),
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(TAG_END, &[]),
        ]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(20)]);
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(39, &sprite),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.sprite-bounds-short")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from("swf.timeline.define-sprite")),
                ),
                (
                    String::from("characterId"),
                    ImportDiagnosticDetailValue::Number(20.0),
                ),
                (
                    String::from("missingChildren"),
                    ImportDiagnosticDetailValue::Number(1.0),
                ),
            ])
        );
    }

    #[test]
    fn stays_silent_when_every_sprite_child_contributes_bounds() {
        let shape = join_bytes(&[&uint16(7), &create_rectangle_record(0, 200, 0, 100)]);
        let child = join_bytes(&[&[0x02], &uint16(1), &uint16(7)]);
        let sprite = join_bytes(&[
            &uint16(20),
            &uint16(1),
            &create_tag(26, &child),
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(TAG_END, &[]),
        ]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(20)]);
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(39, &sprite),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        let document =
            create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        assert_eq!(children.len(), 1);
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.sprite-bounds-short")
        );
    }

    #[test]
    fn reports_an_advanced_blend_without_a_node_to_carry_it() {
        let placement = join_bytes(&[&[0x02, 0x02], &uint16(1), &uint16(7), &[13]]);
        let source = create_swf(
            &[
                create_tag(70, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.appearance-without-node")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from("swf.placement.blend-mode")),
                ),
                (
                    String::from("frame"),
                    ImportDiagnosticDetailValue::Number(1.0),
                ),
            ])
        );
    }

    #[test]
    fn stays_silent_when_an_advanced_blend_has_a_node() {
        let placement = join_bytes(&[
            &[0x20 | 0x02, 0x02],
            &uint16(3),
            &uint16(7),
            b"overlaid\0",
            &[13],
        ]);
        let source = create_swf(
            &[
                create_tag(70, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        let result =
            create_scene2d_import_from_swf(&source, &options(), Some(&mut diagnostics)).unwrap();
        assert_eq!(result.read().unwrap().appearances.len(), 1);
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.appearance-without-node")
        );
    }

    #[test]
    fn reports_a_reused_font_character_id() {
        let glyph = [0x30, 0x28, 0x00, 0x00, 0x40, 0x00];
        let font = join_bytes(&[&uint16(4), &uint16(2), &glyph]);
        let source = create_swf(
            &[
                create_tag(10, &font),
                create_tag(10, &font),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.font-character-id-reused")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from("swf.font.define-font")),
                ),
                (
                    String::from("characterId"),
                    ImportDiagnosticDetailValue::Number(4.0),
                ),
            ])
        );
    }

    #[test]
    fn stays_silent_about_a_font_whose_character_id_is_used_once() {
        let glyph = [0x30, 0x28, 0x00, 0x00, 0x40, 0x00];
        let first = join_bytes(&[&uint16(4), &uint16(2), &glyph]);
        let second = join_bytes(&[&uint16(5), &uint16(2), &glyph]);
        let source = create_swf(
            &[
                create_tag(10, &first),
                create_tag(10, &second),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.font-character-id-reused")
        );
    }

    #[test]
    fn reports_an_edit_text_whose_font_id_resolves_to_no_name() {
        let field = join_bytes(&[
            &uint16(12),
            &create_rectangle_record(0, 4000, 0, 800),
            &[0x80 | 0x40 | 0x20 | 0x04 | 0x01, 0x20 | 0x08],
            &uint16(7),
            &uint16(240),
            &[0x11, 0x22, 0x33, 0xff],
            &[2],
            &uint16(20),
            &uint16(40),
            &uint16(60),
            &uint16(80),
            b"varName\0",
            b"Hello\0",
        ]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(12)]);
        let source = create_swf(
            &[
                create_tag(37, &field),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        let document =
            create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        assert_eq!(children.len(), 1);
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.edit-text-font-name-unresolved")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from("swf.text.define-edit-text")),
                ),
                (
                    String::from("fontId"),
                    ImportDiagnosticDetailValue::Number(7.0),
                ),
            ])
        );
    }

    #[test]
    fn reports_a_declined_frame_script_through_the_full_import_path() {
        let abc = build_frame_script_abc(Some(1));
        let payload = join_bytes(&[&uint32(0), b"frame\0", &abc]);
        let source = create_swf(
            &[create_tag(82, &payload), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.abc-frame-script-declined")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("frame"),
                    ImportDiagnosticDetailValue::Number(1.0),
                ),
                (
                    String::from("reason"),
                    ImportDiagnosticDetailValue::String(String::from("commands-declined")),
                ),
            ])
        );
    }

    #[test]
    fn reports_an_undecodable_define_morph_shape_two() {
        let body = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 200, 0, 200),
            &create_rectangle_record(0, 400, 0, 400),
            &create_rectangle_record(0, 200, 0, 200),
            &create_rectangle_record(0, 400, 0, 400),
            &[0],
            &uint32(0xffff),
            &[0],
        ]);
        let source = create_swf(
            &[create_tag(84, &body), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.morph-shape-undecodable")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from(
                        "swf.morph.define-morph-shape-2",
                    )),
                ),
                (
                    String::from("characterId"),
                    ImportDiagnosticDetailValue::Number(7.0),
                ),
            ])
        );
    }

    #[test]
    fn reports_an_uncomposable_define_text_two_body() {
        let mut record = SwfBitWriter::new();
        record.write_unsigned(1, 1);
        record.write_unsigned(0, 3);
        record.write_unsigned(1, 1);
        record.write_unsigned(1, 1);
        record.write_unsigned(0, 1);
        record.write_unsigned(0, 1);
        let text = join_bytes(&[
            &uint16(6),
            &create_rectangle_record(0, 1024, 0, 1024),
            &create_matrix_record(1.0, 0.0, 0.0, 1.0, 0, 0),
            &[4, 8],
            &record.to_bytes(),
        ]);
        let source = create_swf(
            &[create_tag(33, &text), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.text-shape-uncomposable")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from("swf.text.define-text-2")),
                ),
                (
                    String::from("characterId"),
                    ImportDiagnosticDetailValue::Number(6.0),
                ),
            ])
        );
    }

    #[test]
    fn reports_a_reused_define_font_two_character_id() {
        let font = join_bytes(&[&uint16(4), &[0, 0, 0], &uint16(0), &uint16(0)]);
        let source = create_swf(
            &[
                create_tag(48, &font),
                create_tag(48, &font),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.font-character-id-reused")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from("swf.font.define-font-2")),
                ),
                (
                    String::from("characterId"),
                    ImportDiagnosticDetailValue::Number(4.0),
                ),
            ])
        );
    }

    #[test]
    fn stays_silent_when_an_edit_text_font_id_resolves() {
        let font = join_bytes(&[&uint16(7), &[0, 0, 5], b"Arial", &uint16(0), &uint16(0)]);
        let field = join_bytes(&[
            &uint16(12),
            &create_rectangle_record(0, 4000, 0, 800),
            &[0x80 | 0x40 | 0x20 | 0x04 | 0x01, 0x20 | 0x08],
            &uint16(7),
            &uint16(240),
            &[0x11, 0x22, 0x33, 0xff],
            &[2],
            &uint16(20),
            &uint16(40),
            &uint16(60),
            &uint16(80),
            b"varName\0",
            b"Hello\0",
        ]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(12)]);
        let source = create_swf(
            &[
                create_tag(48, &font),
                create_tag(37, &field),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        let document =
            create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        assert_eq!(children.len(), 1);
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.edit-text-font-name-unresolved")
        );
    }

    #[test]
    fn stays_silent_about_an_anonymous_abc_it_obeys() {
        let abc = build_frame_script_abc(None);
        let source = create_swf(
            &[create_tag(72, &abc), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.abc-frame-scripts-unreadable")
        );
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.abc-frame-script-declined")
        );
    }

    #[test]
    fn stays_silent_about_a_define_text_two_body_that_composes() {
        let glyph = [0x30, 0x28, 0x00, 0x00, 0x40, 0x00];
        let font = join_bytes(&[&uint16(4), &uint16(2), &glyph]);
        let mut record = SwfBitWriter::new();
        record.write_unsigned(1, 1);
        record.write_unsigned(0, 3);
        record.write_unsigned(1, 1);
        record.write_unsigned(1, 1);
        record.write_unsigned(0, 1);
        record.write_unsigned(0, 1);
        let text = join_bytes(&[
            &uint16(6),
            &create_rectangle_record(0, 1024, 0, 1024),
            &create_matrix_record(1.0, 0.0, 0.0, 1.0, 0, 0),
            &[4, 8],
            &record.to_bytes(),
            &uint16(4),
            &[0xff, 0x00, 0x00, 0xff],
            &uint16(1024),
            &[1],
            &pack_glyph_entry(0, 600),
            &[0],
        ]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(6)]);
        let source = create_swf(
            &[
                create_tag(10, &font),
                create_tag(33, &text),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        let document =
            create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        assert_eq!(children.len(), 1);
        assert_eq!(children[0].read().unwrap().node_fields().kind, SHAPE_KIND);
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.text-shape-uncomposable")
        );
    }

    #[test]
    fn reports_each_whole_document_header_rejection_with_its_own_cause() {
        let kinds_for = |file: Vec<u8>| {
            let mut diagnostics = Vec::new();
            assert!(
                create_scene2d_from_swf(&bytes_ref(file), &options(), Some(&mut diagnostics))
                    .is_none()
            );
            diagnostics
                .into_iter()
                .map(|entry| entry.kind)
                .collect::<Vec<_>>()
        };

        let zero_version = join_bytes(&[
            &[0x46, 0x57, 0x53, 0],
            &uint32(64),
            &create_rectangle_record(0, 10, 0, 10),
        ]);
        assert!(
            kinds_for(zero_version)
                .iter()
                .any(|kind| kind == "swf.header-fields-invalid")
        );

        let no_stage = join_bytes(&[&[0x46, 0x57, 0x53, 9], &uint32(12), &[0xf8, 0, 0, 0]]);
        assert!(
            kinds_for(no_stage)
                .iter()
                .any(|kind| kind == "swf.stage-bounds-unreadable")
        );

        let stage = create_rectangle_record(0, 2000, 0, 1000);
        let no_frame_rate = join_bytes(&[
            &[0x46, 0x57, 0x53, 9],
            &uint32((8 + stage.len()) as u32),
            &stage,
        ]);
        assert!(
            kinds_for(no_frame_rate)
                .iter()
                .any(|kind| kind == "swf.header-truncated")
        );
    }

    #[test]
    fn reports_a_discarded_jpeg_alpha_stream_as_a_skip() {
        let jpeg = create_jpeg_header(23, 17);
        let body = join_bytes(&[&uint16(16), &uint32(jpeg.len() as u32), &jpeg, &[1, 2, 3]]);
        let source = create_swf(
            &[
                create_tag(35, &body),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let skipped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.jpeg-alpha-stream")
            .collect::<Vec<_>>();
        assert_eq!(skipped.len(), 1);
        assert_eq!(skipped[0].severity, ImportDiagnosticSeverity::Skip);
        assert_eq!(
            skipped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from(
                        "swf.bitmap.define-bits-jpeg-3",
                    )),
                ),
                (
                    String::from("characterId"),
                    ImportDiagnosticDetailValue::Number(16.0),
                ),
                (
                    String::from("discardedBytes"),
                    ImportDiagnosticDetailValue::Number(3.0),
                ),
            ])
        );
    }

    #[test]
    fn reports_a_legacy_split_jpeg_with_no_tables() {
        let body = join_bytes(&[&uint16(9), &[0xff, 0xd8, 0xff, 0xd9]]);
        let source = create_swf(
            &[
                create_tag(6, &body),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.jpeg-tables-missing")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from(
                        "swf.bitmap.define-bits-jpeg-tables",
                    )),
                ),
                (
                    String::from("characterId"),
                    ImportDiagnosticDetailValue::Number(9.0),
                ),
            ])
        );
    }

    #[test]
    fn reports_scene_names_as_a_skip() {
        let scenes = join_bytes(&[
            &encoded_uint32(1),
            &encoded_uint32(0),
            b"Scene 1\0",
            &encoded_uint32(0),
        ]);
        let source = create_swf(
            &[
                create_tag(86, &scenes),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let skipped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.scene-names")
            .collect::<Vec<_>>();
        assert_eq!(skipped.len(), 1);
        assert_eq!(skipped[0].severity, ImportDiagnosticSeverity::Skip);
        assert_eq!(
            skipped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from(
                        "swf.timeline.define-scene-and-frame-label-data",
                    )),
                ),
                (
                    String::from("sceneCount"),
                    ImportDiagnosticDetailValue::Number(1.0),
                ),
            ])
        );
    }

    #[test]
    fn reports_a_frame_script_declined_for_non_playback_commands() {
        let source = create_swf(
            &[
                create_tag(12, &[0x96, 0x02, 0x00, 0x08, 0x00, 0x3d, 0x00]),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let skipped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.frame-script-declined")
            .collect::<Vec<_>>();
        assert_eq!(skipped.len(), 1);
        assert_eq!(skipped[0].severity, ImportDiagnosticSeverity::Skip);
        assert_eq!(
            skipped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from("swf.script.do-action")),
                ),
                (
                    String::from("frame"),
                    ImportDiagnosticDetailValue::Number(1.0),
                ),
            ])
        );
    }

    #[test]
    fn reports_a_declined_init_action() {
        let action = join_bytes(&[&uint16(20), &[0x96, 0x02, 0x00, 0x08, 0x00, 0x3d, 0x00]]);
        let source = create_swf(
            &[
                create_tag(59, &action),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let skipped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.frame-script-declined")
            .collect::<Vec<_>>();
        assert_eq!(skipped.len(), 1);
        assert_eq!(skipped[0].severity, ImportDiagnosticSeverity::Skip);
        assert_eq!(
            skipped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from("swf.script.do-init-action",)),
                ),
                (
                    String::from("characterId"),
                    ImportDiagnosticDetailValue::Number(20.0),
                ),
            ])
        );
    }

    #[test]
    fn stays_silent_about_an_init_action_it_obeys() {
        let action = join_bytes(&[&uint16(20), &[0x07, 0x00]]);
        let source = create_swf(
            &[
                create_tag(59, &action),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.frame-script-declined")
        );
    }

    #[test]
    fn reports_nested_masks_collapsing_and_masks_without_geometry() {
        let outer = join_bytes(&[&[0x40 | 0x02], &uint16(1), &uint16(1), &uint16(9)]);
        let inner = join_bytes(&[&[0x40 | 0x02], &uint16(2), &uint16(2), &uint16(9)]);
        let content = join_bytes(&[&[0x02], &uint16(3), &uint16(3)]);
        let source = create_swf(
            &[
                create_tag(26, &outer),
                create_tag(26, &inner),
                create_tag(26, &content),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics));
        let collapsed = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.nested-mask-collapsed")
            .collect::<Vec<_>>();
        assert!(!collapsed.is_empty());
        assert_eq!(collapsed[0].severity, ImportDiagnosticSeverity::Skip);
        assert_eq!(
            collapsed[0].detail.as_ref().unwrap().get("capability"),
            Some(&ImportDiagnosticDetailValue::String(String::from(
                "swf.placement.clip-depth",
            )))
        );
        assert_eq!(
            collapsed[0].detail.as_ref().unwrap().get("covering"),
            Some(&ImportDiagnosticDetailValue::Number(2.0))
        );
        let unmasked = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.mask-without-geometry")
            .collect::<Vec<_>>();
        assert!(!unmasked.is_empty());
        assert_eq!(unmasked[0].severity, ImportDiagnosticSeverity::Recover);
        assert_eq!(
            unmasked[0].detail.as_ref().unwrap().get("capability"),
            Some(&ImportDiagnosticDetailValue::String(String::from(
                "swf.placement.clip-depth",
            )))
        );
    }

    #[test]
    fn reports_a_button_interaction_state_other_than_up() {
        let button = join_bytes(&[
            &uint16(12),
            &[0, 0, 0],
            &[0x02],
            &uint16(7),
            &uint16(1),
            &create_rectangle_record(0, 0, 0, 0),
            &[0, 0],
        ]);
        let source = create_swf(
            &[
                create_tag(34, &button),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let skipped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.button-interaction-state")
            .collect::<Vec<_>>();
        assert!(!skipped.is_empty());
        assert_eq!(skipped[0].severity, ImportDiagnosticSeverity::Skip);
        assert_eq!(
            skipped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("characterId"),
                    ImportDiagnosticDetailValue::Number(7.0),
                ),
                (
                    String::from("flags"),
                    ImportDiagnosticDetailValue::Number(2.0),
                ),
            ])
        );
    }

    #[test]
    fn reports_a_legacy_split_jpeg_whose_halves_will_not_splice() {
        let body = join_bytes(&[&uint16(9), &[0x01, 0x02, 0x03, 0x04]]);
        let source = create_swf(
            &[
                create_tag(8, &[0xff, 0xd8, 0xff, 0xd9]),
                create_tag(6, &body),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.jpeg-tables-unsplittable")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from(
                        "swf.bitmap.define-bits-jpeg-tables",
                    )),
                ),
                (
                    String::from("characterId"),
                    ImportDiagnosticDetailValue::Number(9.0),
                ),
            ])
        );
    }

    #[test]
    fn reports_a_font_whose_glyph_table_does_not_decode() {
        let body = join_bytes(&[&uint16(4), &[0xff, 0xff, 0xff, 0xff]]);
        let source = create_swf(
            &[
                create_tag(48, &body),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.font-glyph-table")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from("swf.font.define-font-2")),
                ),
                (
                    String::from("characterId"),
                    ImportDiagnosticDetailValue::Number(4.0),
                ),
            ])
        );
    }

    #[test]
    fn reports_a_non_mp3_sound_stream() {
        let header = join_bytes(&[&[0, 1 << 4], &uint16(1152)]);
        let source = create_swf(
            &[
                create_tag(18, &header),
                create_tag(19, &[1, 2, 3, 4]),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let skipped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.stream-sound-format")
            .collect::<Vec<_>>();
        assert_eq!(skipped.len(), 1);
        assert_eq!(skipped[0].severity, ImportDiagnosticSeverity::Skip);
        assert_eq!(
            skipped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from(
                        "swf.axis.sound-format-non-mp3",
                    )),
                ),
                (
                    String::from("format"),
                    ImportDiagnosticDetailValue::Number(1.0),
                ),
            ])
        );
    }

    #[test]
    fn reports_one_glyph_whose_outline_does_not_decode() {
        let good = create_box_glyph_bytes(256);
        let bad = [0xff];
        let offsets = join_bytes(&[
            &uint16(6),
            &uint16((6 + good.len()) as u16),
            &uint16((6 + good.len() + bad.len()) as u16),
        ]);
        let body = join_bytes(&[
            &uint16(4),
            &[0, 0, 0],
            &uint16(2),
            &offsets,
            &good,
            &bad,
            &[0x41, 0x42],
        ]);
        let source = create_swf(
            &[
                create_tag(48, &body),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.font-glyph-outline")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap().get("capability"),
            Some(&ImportDiagnosticDetailValue::String(String::from(
                "swf.font.define-font-2",
            )))
        );
        assert_eq!(
            dropped[0].detail.as_ref().unwrap().get("lostGlyphs"),
            Some(&ImportDiagnosticDetailValue::Number(1.0))
        );
    }

    #[test]
    fn stays_silent_about_a_shape_video_stream_and_scene_table_that_lose_nothing() {
        let shape = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 400, 0, 400),
            &create_solid_shape_bytes(0x3366cc, &[(400, 0), (0, 400), (-400, 0), (0, -400)]),
        ]);
        let video = join_bytes(&[&uint16(4), &uint16(1), &uint16(16), &uint16(16), &[0x01, 2]]);
        let scenes = join_bytes(&[
            &encoded_uint32(0),
            &encoded_uint32(1),
            &encoded_uint32(0),
            b"start\0",
        ]);
        let shape_placement = join_bytes(&[&[0x02], &uint16(1), &uint16(7)]);
        let video_placement = join_bytes(&[&[0x02], &uint16(2), &uint16(4)]);
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(60, &video),
                create_tag(86, &scenes),
                create_tag(26, &shape_placement),
                create_tag(26, &video_placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        let document =
            create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        assert_eq!(children.len(), 2);
        assert_eq!(
            get_timeline_current_label(&root_timeline(&document))
                .unwrap()
                .name,
            "start"
        );
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.shape-body-unreadable")
        );
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.video-frame-payload")
        );
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.scene-names")
        );
    }

    #[test]
    fn stays_silent_about_a_frame_script_and_mask_that_lose_nothing() {
        let mask = join_bytes(&[
            &uint16(5),
            &create_rectangle_record(0, 200, 0, 200),
            &create_solid_shape_bytes(0xffffff, &[(200, 0), (0, 200), (-200, 0), (0, -200)]),
        ]);
        let mask_placement = join_bytes(&[&[0x40 | 0x02], &uint16(1), &uint16(5), &uint16(3)]);
        let content = join_bytes(&[&[0x02], &uint16(2), &uint16(5)]);
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &mask),
                create_tag(26, &mask_placement),
                create_tag(26, &content),
                create_tag(12, &[0x07, 0x00]),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        let document =
            create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).unwrap();
        assert!(
            flight_timeline::get_timeline_frame_script(
                &root_timeline(&document),
                &TimelineFrameArg::Frame(1),
            )
            .is_some()
        );
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.frame-script-declined")
        );
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.mask-without-geometry")
        );
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.nested-mask-collapsed")
        );
    }

    #[test]
    fn stays_silent_about_a_font_spliced_jpeg_and_jpeg_three_that_lose_nothing() {
        let glyph = create_box_glyph_bytes(256);
        let offsets = join_bytes(&[&uint16(4), &uint16((4 + glyph.len()) as u16)]);
        let font = join_bytes(&[
            &uint16(4),
            &[0, 0, 0],
            &uint16(1),
            &offsets,
            &glyph,
            &[0x41],
        ]);
        let tables = [0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x11, 0x22, 0xff, 0xd9];
        let split = join_bytes(&[&uint16(9), &create_jpeg_header(11, 13)]);
        let jpeg = create_jpeg_header(23, 17);
        let jpeg_three = join_bytes(&[&uint16(16), &uint32(jpeg.len() as u32), &jpeg]);
        let split_placement = join_bytes(&[&[0x02], &uint16(1), &uint16(9)]);
        let jpeg_three_placement = join_bytes(&[&[0x02], &uint16(2), &uint16(16)]);
        let source = create_swf(
            &[
                create_tag(48, &font),
                create_tag(8, &tables),
                create_tag(6, &split),
                create_tag(35, &jpeg_three),
                create_tag(26, &split_placement),
                create_tag(26, &jpeg_three_placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        let document =
            create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).unwrap();
        assert_eq!(document.read().unwrap().image_resources.len(), 2);
        assert_eq!(
            create_glyph_outline_sources_from_swf(&source, &options(), None)
                .unwrap()
                .len(),
            1
        );
        for kind in [
            "swf.font-glyph-table",
            "swf.font-glyph-outline",
            "swf.jpeg-tables-missing",
            "swf.jpeg-tables-unsplittable",
            "swf.jpeg-alpha-stream",
        ] {
            assert!(diagnostics.iter().all(|entry| entry.kind != kind));
        }
    }

    #[test]
    fn stays_silent_about_an_mp3_stream_whose_blocks_concatenate() {
        let header = join_bytes(&[&[0, 2 << 4], &uint16(1152)]);
        let block = join_bytes(&[&uint16(1), &uint16(0), &[0xff, 0xfb, 0x90, 0x00]]);
        let source = create_swf(
            &[
                create_tag(18, &header),
                create_tag(19, &block),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        let document =
            create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).unwrap();
        assert_eq!(document.read().unwrap().audio_resources.len(), 1);
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.stream-sound-format")
        );
    }

    #[test]
    fn reports_a_label_past_the_last_frame_and_stays_silent_when_reached() {
        let past_labels = join_bytes(&[
            &encoded_uint32(0),
            &encoded_uint32(1),
            &encoded_uint32(40),
            b"never\0",
        ]);
        let past = create_swf(
            &[
                create_tag(86, &past_labels),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&past, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.label-past-last-frame")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from("swf.timeline.frame-label")),
                ),
                (
                    String::from("dropped"),
                    ImportDiagnosticDetailValue::Number(1.0),
                ),
                (
                    String::from("frames"),
                    ImportDiagnosticDetailValue::Number(1.0),
                ),
            ])
        );

        let reached_labels = join_bytes(&[
            &encoded_uint32(0),
            &encoded_uint32(1),
            &encoded_uint32(0),
            b"start\0",
        ]);
        let reached = create_swf(
            &[
                create_tag(86, &reached_labels),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut quiet = Vec::new();
        let document = create_scene2d_from_swf(&reached, &options(), Some(&mut quiet)).unwrap();
        assert_eq!(
            get_timeline_current_label(&root_timeline(&document))
                .unwrap()
                .name,
            "start"
        );
        assert!(
            quiet
                .iter()
                .all(|entry| entry.kind != "swf.label-past-last-frame")
        );
    }

    #[test]
    fn reports_an_unreadable_body_for_every_later_shape_generation() {
        let shape_two = join_bytes(&[&uint16(2), &create_rectangle_record(0, 20, 0, 20), &[0xff]]);
        let shape_three =
            join_bytes(&[&uint16(3), &create_rectangle_record(0, 20, 0, 20), &[0xff]]);
        let shape_four = join_bytes(&[
            &uint16(4),
            &create_rectangle_record(0, 20, 0, 20),
            &create_rectangle_record(0, 20, 0, 20),
            &[0, 0xff],
        ]);
        let source = create_swf(
            &[
                create_tag(22, &shape_two),
                create_tag(32, &shape_three),
                create_tag(83, &shape_four),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let capabilities = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.shape-body-unreadable")
            .map(|entry| entry.detail.as_ref().unwrap()["capability"].clone())
            .collect::<Vec<_>>();
        assert_eq!(
            capabilities,
            vec![
                ImportDiagnosticDetailValue::String(String::from("swf.shape.define-shape-2")),
                ImportDiagnosticDetailValue::String(String::from("swf.shape.define-shape-3")),
                ImportDiagnosticDetailValue::String(String::from("swf.shape.define-shape-4")),
            ]
        );
    }

    #[test]
    fn reports_unreadable_glyph_tables_for_define_font_and_define_font_three() {
        let legacy = join_bytes(&[&uint16(6), &[0xff, 0xff]]);
        let third = join_bytes(&[&uint16(7), &[0xff, 0xff, 0xff, 0xff]]);
        let source = create_swf(
            &[
                create_tag(10, &legacy),
                create_tag(75, &third),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let capabilities = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.font-glyph-table")
            .map(|entry| entry.detail.as_ref().unwrap()["capability"].clone())
            .collect::<Vec<_>>();
        assert_eq!(
            capabilities,
            vec![
                ImportDiagnosticDetailValue::String(String::from("swf.font.define-font")),
                ImportDiagnosticDetailValue::String(String::from("swf.font.define-font-3")),
            ]
        );
    }

    #[test]
    fn reports_a_discarded_define_bits_jpeg_four_alpha_stream() {
        let jpeg = create_jpeg_header(31, 19);
        let body = join_bytes(&[
            &uint16(17),
            &uint32((jpeg.len() + 2) as u32),
            &uint16(0),
            &jpeg,
            &[4, 5, 6],
        ]);
        let source = create_swf(
            &[
                create_tag(90, &body),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let mut diagnostics = Vec::new();
        assert!(create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).is_some());
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.jpeg-alpha-stream")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(
            dropped[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([
                (
                    String::from("capability"),
                    ImportDiagnosticDetailValue::String(String::from(
                        "swf.bitmap.define-bits-jpeg-4",
                    )),
                ),
                (
                    String::from("characterId"),
                    ImportDiagnosticDetailValue::Number(17.0),
                ),
                (
                    String::from("discardedBytes"),
                    ImportDiagnosticDetailValue::Number(3.0),
                ),
            ])
        );
    }

    #[test]
    fn reports_the_box_a_morph_occupies_at_its_ratio() {
        let start_edges = morph_box(200);
        let end_edges = morph_box(400);
        let styles = join_bytes(&[
            &[1, 0x00, 0xff, 0x00, 0x00, 0xff, 0x00, 0x00, 0xff, 0xff],
            &[0],
        ]);
        let body = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 200, 0, 200),
            &create_rectangle_record(0, 400, 0, 400),
            &uint32((styles.len() + start_edges.len()) as u32),
            &styles,
            &start_edges,
            &end_edges,
        ]);
        let place = |depth, ratio| {
            let placement =
                join_bytes(&[&[0x02 | 0x10], &uint16(depth), &uint16(7), &uint16(ratio)]);
            create_tag(26, &placement)
        };
        let source = create_swf(
            &[
                create_tag(46, &body),
                place(1, 0),
                place(2, 0x7fff),
                place(3, 0xffff),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        let widths = children
            .iter()
            .map(|node| get_node_local_bounds_rectangle(node).width)
            .collect::<Vec<_>>();
        assert!((widths[0] - 10.0).abs() < f32::EPSILON);
        assert!((widths[1] - 15.0).abs() < 0.1);
        assert!((widths[2] - 20.0).abs() < f32::EPSILON);
    }

    #[test]
    fn places_a_morph_character_at_each_placement_ratio() {
        let start_edges = morph_box(200);
        let end_edges = morph_box(400);
        let styles = join_bytes(&[
            &[1, 0x00, 0xff, 0x00, 0x00, 0xff, 0x00, 0x00, 0xff, 0xff],
            &[0],
        ]);
        let body = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 200, 0, 200),
            &create_rectangle_record(0, 400, 0, 400),
            &uint32((styles.len() + start_edges.len()) as u32),
            &styles,
            &start_edges,
            &end_edges,
        ]);
        let first = join_bytes(&[&[0x02 | 0x10], &uint16(1), &uint16(7), &uint16(0)]);
        let second = join_bytes(&[&[0x02 | 0x10], &uint16(2), &uint16(7), &uint16(0xffff)]);
        let source = create_swf(
            &[
                create_tag(46, &body),
                create_tag(26, &first),
                create_tag(26, &second),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        let first: NodeRef = children[0].clone();
        let second: NodeRef = children[1].clone();
        assert_eq!(first.read().unwrap().node_fields().kind, MORPH_SHAPE_KIND);
        assert_eq!(second.read().unwrap().node_fields().kind, MORPH_SHAPE_KIND);
        assert!(!std::sync::Arc::ptr_eq(&first, &second));
        assert_eq!(
            first
                .read()
                .unwrap()
                .as_any()
                .downcast_ref::<MorphShape>()
                .unwrap()
                .data
                .progress,
            0.0
        );
        assert_eq!(
            second
                .read()
                .unwrap()
                .as_any()
                .downcast_ref::<MorphShape>()
                .unwrap()
                .data
                .progress,
            1.0
        );
        assert!((get_node_local_bounds_rectangle(&first).width - 10.0).abs() < f32::EPSILON);
        assert!((get_node_local_bounds_rectangle(&second).width - 20.0).abs() < f32::EPSILON);
    }

    #[test]
    fn collapses_a_scaling_grid_wrapper_sprite_into_one_nine_slice_shape() {
        let shape = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 400, 0, 400),
            &create_solid_shape_bytes(0x123456, &[(400, 0)]),
        ]);
        let inner = join_bytes(&[&[0x02], &uint16(1), &uint16(7)]);
        let sprite = join_bytes(&[
            &uint16(20),
            &uint16(1),
            &create_tag(26, &inner),
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(TAG_END, &[]),
        ]);
        let grid = join_bytes(&[&uint16(20), &create_rectangle_record(100, 300, 100, 300)]);
        let outer = join_bytes(&[&[0x02], &uint16(1), &uint16(20)]);
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(39, &sprite),
                create_tag(78, &grid),
                create_tag(26, &outer),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let mut diagnostics = Vec::new();
        let document =
            create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        assert_eq!(children.len(), 1);
        let target = children[0].read().unwrap();
        let target = target.as_any().downcast_ref::<Scale9Shape>().unwrap();
        assert_eq!(target.node_fields().kind, SCALE9_SHAPE_KIND);
        assert_eq!(
            (
                target.data.scale9_grid.x,
                target.data.scale9_grid.y,
                target.data.scale9_grid.width,
                target.data.scale9_grid.height,
            ),
            (5.0, 5.0, 10.0, 10.0),
        );
        assert_eq!(
            target
                .data
                .commands
                .iter()
                .filter(
                    |token| matches!(token, ShapeCommandToken::String(value) if value == "lineTo")
                )
                .count(),
            1,
        );
        let mut nested = Vec::new();
        get_node_children(&mut nested, &children[0]);
        assert!(nested.is_empty());
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.kind != "swf.scaling-grid-dropped")
        );
    }

    #[test]
    fn leaves_a_scaling_grid_on_a_multi_layer_sprite_as_an_ordinary_clip() {
        let shape = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 400, 0, 400),
            &create_solid_shape_bytes(0x123456, &[(400, 0)]),
        ]);
        let first = join_bytes(&[&[0x02], &uint16(1), &uint16(7)]);
        let second = join_bytes(&[&[0x02], &uint16(2), &uint16(7)]);
        let sprite = join_bytes(&[
            &uint16(20),
            &uint16(1),
            &create_tag(26, &first),
            &create_tag(26, &second),
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(TAG_END, &[]),
        ]);
        let grid = join_bytes(&[&uint16(20), &create_rectangle_record(100, 300, 100, 300)]);
        let outer = join_bytes(&[&[0x02], &uint16(1), &uint16(20)]);
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(39, &sprite),
                create_tag(78, &grid),
                create_tag(26, &outer),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let mut diagnostics = Vec::new();
        let document =
            create_scene2d_from_swf(&source, &options(), Some(&mut diagnostics)).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        assert_eq!(children.len(), 1);
        assert!(
            children[0]
                .read()
                .unwrap()
                .as_any()
                .downcast_ref::<MovieClip>()
                .is_some()
        );
        let dropped = diagnostics
            .iter()
            .filter(|entry| entry.kind == "swf.scaling-grid-dropped")
            .collect::<Vec<_>>();
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].origin, "populateSwfTimelineNode");
        assert_eq!(dropped[0].severity, ImportDiagnosticSeverity::Drop);
    }

    #[test]
    fn carries_an_mp3_event_sound_out_as_undecoded_bytes_past_its_seek_prefix() {
        let frames = [0xff, 0xfb, 0x90, 0x44, 0x11, 0x22];
        let sound = join_bytes(&[
            &uint16(9),
            &[0x2b],
            &crate::support::uint32(1152),
            &uint16(0),
            &frames,
        ]);
        let export = join_bytes(&[&uint16(1), &uint16(9), b"theme\0"]);
        let source = create_swf(
            &[
                create_tag(14, &sound),
                create_tag(56, &export),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        assert_eq!(document.read().unwrap().audio_resources.len(), 1);
        let reference = embedded_audio_reference(&document, 0);
        let reference = reference.read().unwrap();
        assert_eq!(reference.mime_type.as_deref(), Some("audio/mpeg"));
        assert_eq!(&**reference.bytes.read().unwrap(), &frames);
        assert_eq!(reference.name.as_deref(), Some("theme"));
        assert!(reference.resource.read().unwrap().buffer.is_none());
        assert_eq!(
            reference.state,
            flight_resource::ResourceResolutionState::Unresolved
        );
    }

    #[test]
    fn tags_a_sound_without_a_standard_container_instead_of_dropping_it_untyped() {
        let payload = [1, 2, 3, 4];
        let sound = join_bytes(&[&uint16(9), &[0x1b], &crate::support::uint32(16), &payload]);
        let source = create_swf(
            &[
                create_tag(14, &sound),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let reference = embedded_audio_reference(&document, 0);
        let reference = reference.read().unwrap();
        assert_eq!(
            reference.mime_type.as_deref(),
            Some("audio/vnd.adobe.swf-adpcm; rate=22050; channels=2; bits=16")
        );
        assert!(reference.name.is_none());
        assert_eq!(&**reference.bytes.read().unwrap(), &payload);
    }

    #[test]
    fn turns_a_start_sound_into_an_audio_cue_sharing_the_documents_resource() {
        let sound = join_bytes(&[
            &uint16(9),
            &[0x2b],
            &crate::support::uint32(1152),
            &uint16(0),
            &mp3(),
        ]);
        let start = join_bytes(&[&uint16(9), &[0x00]]);
        let source = create_swf(
            &[
                create_tag(14, &sound),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(15, &start),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let cues = root_timeline_cues(&document);
        assert_eq!(cues.len(), 1);
        let cue = cues[0].read().unwrap();
        let cue = cue.as_any().downcast_ref::<TimelineAudioCue>().unwrap();
        assert_eq!(cue.fields.frame, 2);
        assert!(!cue.stop);
        assert_eq!(cue.loops, 1);
        assert_eq!(cue.offset, 0.0);
        assert_eq!(cue.duration, None);
        assert!(cue.envelope.is_empty());
        assert!(!cue.skip_if_playing);
        let reference = embedded_audio_reference(&document, 0);
        assert!(std::sync::Arc::ptr_eq(
            &cue.resource,
            &reference.read().unwrap().resource
        ));
    }

    #[test]
    fn gives_every_cue_naming_one_sound_the_same_resource_the_document_lists() {
        let sound = join_bytes(&[
            &uint16(9),
            &[0x2b],
            &crate::support::uint32(1152),
            &uint16(0),
            &mp3(),
        ]);
        let start = join_bytes(&[&uint16(9), &[0x00]]);
        let source = create_swf(
            &[
                create_tag(14, &sound),
                create_tag(15, &start),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(15, &start),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let cues = root_timeline_cues(&document);
        assert_eq!(cues.len(), 2);
        let first = cues[0].read().unwrap();
        let second = cues[1].read().unwrap();
        let first = first.as_any().downcast_ref::<TimelineAudioCue>().unwrap();
        let second = second.as_any().downcast_ref::<TimelineAudioCue>().unwrap();
        assert_eq!((first.fields.frame, second.fields.frame), (1, 2));
        assert!(std::sync::Arc::ptr_eq(&first.resource, &second.resource));
        let reference = embedded_audio_reference(&document, 0);
        assert!(std::sync::Arc::ptr_eq(
            &first.resource,
            &reference.read().unwrap().resource
        ));
        assert_eq!(document.read().unwrap().audio_resources.len(), 1);
    }

    #[test]
    fn resolves_a_start_sound_two_class_name_against_its_later_symbol_class() {
        let sound = join_bytes(&[
            &uint16(9),
            &[0x2b],
            &crate::support::uint32(1152),
            &uint16(0),
            &mp3(),
        ]);
        let start = join_bytes(&[b"Game.Theme\0", &[0x00]]);
        let linkage = join_bytes(&[&uint16(1), &uint16(9), b"Game.Theme\0"]);
        let source = create_swf(
            &[
                create_tag(14, &sound),
                create_tag(89, &start),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(76, &linkage),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let cues = root_timeline_cues(&document);
        let cue = cues[0].read().unwrap();
        let cue = cue.as_any().downcast_ref::<TimelineAudioCue>().unwrap();
        let reference = embedded_audio_reference(&document, 0);
        assert!(std::sync::Arc::ptr_eq(
            &cue.resource,
            &reference.read().unwrap().resource
        ));
        assert_eq!(document.read().unwrap().audio_resources.len(), 1);
    }

    #[test]
    fn shares_one_resource_between_class_named_and_id_named_triggers() {
        let sound = join_bytes(&[
            &uint16(9),
            &[0x2b],
            &crate::support::uint32(1152),
            &uint16(0),
            &mp3(),
        ]);
        let by_class = join_bytes(&[b"Game.Theme\0", &[0x00]]);
        let by_id = join_bytes(&[&uint16(9), &[0x00]]);
        let linkage = join_bytes(&[&uint16(1), &uint16(9), b"Game.Theme\0"]);
        let source = create_swf(
            &[
                create_tag(14, &sound),
                create_tag(89, &by_class),
                create_tag(15, &by_id),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(76, &linkage),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let cues = root_timeline_cues(&document);
        let first = cues[0].read().unwrap();
        let second = cues[1].read().unwrap();
        let first = first.as_any().downcast_ref::<TimelineAudioCue>().unwrap();
        let second = second.as_any().downcast_ref::<TimelineAudioCue>().unwrap();
        assert!(std::sync::Arc::ptr_eq(&first.resource, &second.resource));
        let reference = embedded_audio_reference(&document, 0);
        assert!(std::sync::Arc::ptr_eq(
            &first.resource,
            &reference.read().unwrap().resource
        ));
    }

    #[test]
    fn converts_a_class_named_triggers_in_point_after_its_character_resolves() {
        let sound = join_bytes(&[
            &uint16(9),
            &[0x2b],
            &crate::support::uint32(44100),
            &uint16(0),
            &mp3(),
        ]);
        let start = join_bytes(&[b"Game.Theme\0", &[0x01], &crate::support::uint32(11025)]);
        let linkage = join_bytes(&[&uint16(1), &uint16(9), b"Game.Theme\0"]);
        let source = create_swf(
            &[
                create_tag(14, &sound),
                create_tag(89, &start),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(76, &linkage),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let cues = root_timeline_cues(&document);
        let cue = cues[0].read().unwrap();
        let cue = cue.as_any().downcast_ref::<TimelineAudioCue>().unwrap();
        assert!((cue.offset - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn keeps_a_class_named_trigger_whose_class_nothing_declares() {
        let sound = join_bytes(&[
            &uint16(9),
            &[0x2b],
            &crate::support::uint32(1152),
            &uint16(0),
            &mp3(),
        ]);
        let start = join_bytes(&[b"Game.Missing\0", &[0x00]]);
        let source = create_swf(
            &[
                create_tag(14, &sound),
                create_tag(89, &start),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let cues = root_timeline_cues(&document);
        let cue = cues[0].read().unwrap();
        let cue = cue.as_any().downcast_ref::<TimelineAudioCue>().unwrap();
        let reference = embedded_audio_reference(&document, 0);
        assert!(!std::sync::Arc::ptr_eq(
            &cue.resource,
            &reference.read().unwrap().resource
        ));
        assert!(cue.resource.read().unwrap().buffer.is_none());
    }

    #[test]
    fn reads_a_stop_trigger_as_stop_rather_than_play() {
        let sound = join_bytes(&[
            &uint16(9),
            &[0x2b],
            &crate::support::uint32(1152),
            &uint16(0),
            &mp3(),
        ]);
        let start = join_bytes(&[&uint16(9), &[0x30]]);
        let source = create_swf(
            &[
                create_tag(14, &sound),
                create_tag(15, &start),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let cues = root_timeline_cues(&document);
        let cue = cues[0].read().unwrap();
        let cue = cue.as_any().downcast_ref::<TimelineAudioCue>().unwrap();
        assert!(cue.stop);
        assert!(!cue.skip_if_playing);
    }

    #[test]
    fn converts_in_and_out_points_from_the_sounds_samples_into_seconds() {
        let sound = join_bytes(&[
            &uint16(9),
            &[0x2b],
            &crate::support::uint32(44100),
            &uint16(0),
            &mp3(),
        ]);
        let start = join_bytes(&[
            &uint16(9),
            &[0x03],
            &crate::support::uint32(11025),
            &crate::support::uint32(33075),
        ]);
        let source = create_swf(
            &[
                create_tag(14, &sound),
                create_tag(15, &start),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let cues = root_timeline_cues(&document);
        let cue = cues[0].read().unwrap();
        let cue = cue.as_any().downcast_ref::<TimelineAudioCue>().unwrap();
        assert!((cue.offset - 0.5).abs() < f64::EPSILON);
        assert!((cue.duration.unwrap() - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn reads_a_stereo_envelope_in_44100_hz_samples_whatever_the_sound_rate() {
        let sound = join_bytes(&[
            &uint16(9),
            &[0x2b],
            &crate::support::uint32(1152),
            &uint16(0),
            &mp3(),
        ]);
        let start = join_bytes(&[
            &uint16(9),
            &[0x08, 2],
            &crate::support::uint32(0),
            &uint16(32768),
            &uint16(32768),
            &crate::support::uint32(22050),
            &uint16(32768),
            &uint16(0),
        ]);
        let source = create_swf(
            &[
                create_tag(14, &sound),
                create_tag(15, &start),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let cues = root_timeline_cues(&document);
        let cue = cues[0].read().unwrap();
        let cue = cue.as_any().downcast_ref::<TimelineAudioCue>().unwrap();
        assert_eq!(cue.envelope.len(), 2);
        assert_eq!(
            (
                cue.envelope[0].left_gain,
                cue.envelope[0].right_gain,
                cue.envelope[0].time
            ),
            (1.0, 1.0, 0.0)
        );
        assert_eq!(
            (cue.envelope[1].left_gain, cue.envelope[1].right_gain),
            (1.0, 0.0)
        );
        assert!((cue.envelope[1].time - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn lets_a_trigger_name_a_sound_the_tag_stream_has_not_reached_yet() {
        let start = join_bytes(&[&uint16(9), &[0x00]]);
        let sound = join_bytes(&[
            &uint16(9),
            &[0x2b],
            &crate::support::uint32(1152),
            &uint16(0),
            &mp3(),
        ]);
        let source = create_swf(
            &[
                create_tag(15, &start),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(14, &sound),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let cues = root_timeline_cues(&document);
        let cue = cues[0].read().unwrap();
        let cue = cue.as_any().downcast_ref::<TimelineAudioCue>().unwrap();
        let reference = embedded_audio_reference(&document, 0);
        assert!(std::sync::Arc::ptr_eq(
            &cue.resource,
            &reference.read().unwrap().resource
        ));
    }

    #[test]
    fn carries_no_audio_references_for_a_file_that_defines_no_sounds() {
        let document = create_scene2d_from_swf(&empty_swf(), &options(), None).unwrap();
        assert!(document.read().unwrap().audio_resources.is_empty());
    }

    #[test]
    fn carries_an_embedded_image_out_as_undecoded_bytes_on_a_waiting_texture() {
        let png = create_png_header(24, 12);
        let image = join_bytes(&[&uint16(9), &png]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(9)]);
        let source = create_swf(
            &[
                create_tag(21, &image),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        assert_eq!(document.read().unwrap().image_resources.len(), 1);
        let reference = embedded_image_reference(&document, 0);
        let reference = reference.read().unwrap();
        assert_eq!(reference.mime_type.as_deref(), Some("image/png"));
        assert_eq!(&**reference.bytes.read().unwrap(), png.as_slice());
        assert_eq!(
            reference.state,
            flight_resource::ResourceResolutionState::Unresolved
        );
        assert_eq!(reference.textures.len(), 1);
        assert!(get_texture_source(&*reference.textures[0].read().unwrap()).is_none());
    }

    #[test]
    fn places_a_bitmap_character_as_a_sprite_sized_before_any_pixels_load() {
        let image = join_bytes(&[&uint16(9), &create_jpeg_header(8, 8)]);
        let placement = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(9), b"logo\0"]);
        let source = create_swf(
            &[
                create_tag(21, &image),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let target = document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        assert_eq!(target.read().unwrap().node_fields().kind, SPRITE_KIND);
        let texture = {
            let target = target.read().unwrap();
            target
                .as_any()
                .downcast_ref::<Sprite>()
                .unwrap()
                .data
                .texture
                .clone()
                .unwrap()
        };
        let reference = embedded_image_reference(&document, 0);
        assert!(std::sync::Arc::ptr_eq(
            &texture,
            &reference.read().unwrap().textures[0]
        ));
        let target: NodeRef = target;
        let bounds = get_node_local_bounds_rectangle(&target);
        assert_eq!((bounds.width, bounds.height), (8.0, 8.0));
    }

    #[test]
    fn shares_one_image_resource_across_every_placement_of_one_bitmap_character() {
        let image = join_bytes(&[&uint16(9), &create_jpeg_header(8, 8)]);
        let first = join_bytes(&[&[0x02], &uint16(1), &uint16(9)]);
        let second = join_bytes(&[&[0x02], &uint16(2), &uint16(9)]);
        let third = join_bytes(&[&[0x02], &uint16(3), &uint16(9)]);
        let source = create_swf(
            &[
                create_tag(21, &image),
                create_tag(26, &first),
                create_tag(26, &second),
                create_tag(26, &third),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        assert_eq!(document.read().unwrap().image_resources.len(), 1);
        assert_eq!(
            embedded_image_reference(&document, 0)
                .read()
                .unwrap()
                .textures
                .len(),
            1,
        );
    }

    #[test]
    fn accepts_a_tag_stream_that_reaches_its_end_without_an_end_tag() {
        let child = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(7), b"kid\0"]);
        let sprite = join_bytes(&[
            &uint16(20),
            &uint16(1),
            &create_tag(26, &child),
            &create_tag(TAG_SHOW_FRAME, &[]),
        ]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(20)]);
        let source = create_swf(
            &[
                create_tag(39, &sprite),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        assert_eq!(
            document.read().unwrap().slots[0].read().unwrap().name,
            "kid"
        );
        let empty = create_swf(&[], 24.0, [0, 2000, 0, 1000]);
        assert!(
            create_scene2d_from_swf(&empty, &options(), None)
                .unwrap()
                .read()
                .unwrap()
                .slots
                .is_empty()
        );
    }

    #[test]
    fn turns_a_clip_depth_placement_into_a_clip_on_covered_content_without_drawing_the_mask() {
        let mask = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 800, 0, 800),
            &create_solid_shape_bytes(0xffffff, &[(800, 0), (0, 800), (-800, 0), (0, -800)]),
        ]);
        let content = join_bytes(&[
            &uint16(8),
            &create_rectangle_record(0, 2000, 0, 100),
            &create_solid_shape_bytes(0xff0000, &[(2000, 0)]),
        ]);
        let mask_placement = join_bytes(&[
            &[0x40 | 0x04 | 0x02],
            &uint16(1),
            &uint16(7),
            &create_matrix_record(1.0, 0.0, 0.0, 1.0, 100, 0),
            &uint16(5),
        ]);
        let covered = join_bytes(&[
            &[0x04 | 0x02],
            &uint16(3),
            &uint16(8),
            &create_matrix_record(1.0, 0.0, 0.0, 1.0, 40, 0),
        ]);
        let outside = join_bytes(&[&[0x02], &uint16(9), &uint16(8)]);
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &mask),
                create_tag(TAG_DEFINE_SHAPE, &content),
                create_tag(26, &mask_placement),
                create_tag(26, &covered),
                create_tag(26, &outside),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        assert_eq!(children.len(), 2);
        let masked_clip = {
            let masked = children[0].read().unwrap();
            masked
                .as_any()
                .downcast_ref::<Shape>()
                .unwrap()
                .node2d_fields()
                .clip
                .clone()
                .unwrap()
        };
        let unmasked = children[1].read().unwrap();
        assert!(
            unmasked
                .as_any()
                .downcast_ref::<Shape>()
                .unwrap()
                .node2d_fields()
                .clip
                .is_none()
        );
        let clip = masked_clip.read().unwrap();
        assert_eq!(
            clip.contours.as_ref().unwrap(),
            &vec![vec![3.0, 0.0, 43.0, 0.0, 43.0, 40.0, 3.0, 40.0, 3.0, 0.0,]]
        );
        assert_eq!(
            (clip.rect.x, clip.rect.y, clip.rect.width, clip.rect.height),
            (3.0, 0.0, 40.0, 40.0)
        );
        assert_eq!(clip.winding, flight_path::PathWinding::NonZero);
    }

    #[test]
    fn imports_a_compressed_document_through_the_supplied_deflate_slot() {
        let placement = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(7), b"packed\0"]);
        let uncompressed = create_swf(
            &[
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let compressed = {
            let uncompressed = uncompressed.read().unwrap();
            let mut bytes = uncompressed.to_vec();
            bytes[8..].reverse();
            bytes[0] = 0x43;
            bytes_ref(bytes)
        };
        assert!(create_scene2d_from_swf(&compressed, &options(), None).is_none());
        let expected_length = uncompressed.read().unwrap().len() - 8;
        let reversing = HostDecompressDeflateCapability {
            decompress: std::sync::Arc::new(move |body, length, framing| {
                assert_eq!(length, expected_length);
                assert_eq!(framing, CompressionFraming::Rfc1950);
                let mut result = body.to_vec();
                result.reverse();
                return Some(result.into_boxed_slice());
            }),
        };
        let compressed_options = SwfParseOptions {
            deflate: Some(Some(reversing)),
            lzma: None,
            tags: Some(SWF_ALL_TAG_HANDLERS.clone()),
        };
        let document = create_scene2d_from_swf(&compressed, &compressed_options, None).unwrap();
        assert_eq!(document.read().unwrap().source_kind.as_deref(), Some("swf"));
        assert_eq!(
            document.read().unwrap().slots[0].read().unwrap().name,
            "packed"
        );
    }

    #[test]
    fn rejects_a_compressed_document_when_the_deflate_slot_returns_a_short_or_failed_body() {
        let uncompressed = create_swf(
            &[create_tag(TAG_SHOW_FRAME, &[]), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );
        let compressed = {
            let mut bytes = uncompressed.read().unwrap().to_vec();
            bytes[0] = 0x43;
            bytes_ref(bytes)
        };
        for decompress in [
            std::sync::Arc::new(|_: &[u8], _: usize, _: CompressionFraming| None)
                as flight_compression::Decompressor,
            std::sync::Arc::new(|_: &[u8], _: usize, _: CompressionFraming| {
                Some(vec![0u8; 2].into_boxed_slice())
            }) as flight_compression::Decompressor,
        ] {
            let compressed_options = SwfParseOptions {
                deflate: Some(Some(HostDecompressDeflateCapability { decompress })),
                lzma: None,
                tags: Some(SWF_ALL_TAG_HANDLERS.clone()),
            };
            assert!(create_scene2d_from_swf(&compressed, &compressed_options, None).is_none());
        }
    }

    #[test]
    fn imports_the_stage_background_color_as_opaque_packed_rgba() {
        let source = create_swf(
            &[
                create_tag(9, &[0x33, 0x66, 0x99]),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        assert_eq!(
            create_scene2d_from_swf(&source, &options(), None)
                .unwrap()
                .read()
                .unwrap()
                .background_color,
            Some(0x336699ff),
        );
        assert_eq!(
            create_scene2d_from_swf(&empty_swf(), &options(), None)
                .unwrap()
                .read()
                .unwrap()
                .background_color,
            None,
        );
    }

    #[test]
    fn draws_static_text_from_an_embedded_font_as_placed_glyph_outlines() {
        let glyph = create_box_glyph_bytes(512);
        let font = join_bytes(&[&uint16(4), &uint16(2), &glyph]);
        let mut record = SwfBitWriter::new();
        record.write_unsigned(1, 1);
        record.write_unsigned(0, 3);
        record.write_unsigned(1, 1);
        record.write_unsigned(1, 1);
        record.write_unsigned(0, 1);
        record.write_unsigned(0, 1);
        let text = join_bytes(&[
            &uint16(6),
            &create_rectangle_record(0, 1024, 0, 1024),
            &create_matrix_record(1.0, 0.0, 0.0, 1.0, 0, 0),
            &[4, 8],
            &record.to_bytes(),
            &uint16(4),
            &[0xff, 0x00, 0x00],
            &uint16(1024),
            &[1],
            &pack_glyph_entry(0, 600),
            &[0],
        ]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(6)]);
        let source = create_swf(
            &[
                create_tag(10, &font),
                create_tag(11, &text),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        let drawn = children[0].read().unwrap();
        let shape = drawn.as_any().downcast_ref::<Shape>().unwrap();
        assert_eq!(shape.node_fields().kind, SHAPE_KIND);
        assert!(
            matches!(&shape.data.commands[0], ShapeCommandToken::String(value) if value == "beginFill")
        );
        assert!(
            matches!(shape.data.commands[2], ShapeCommandToken::Number(value) if value == 0xff0000ff_u32 as f64)
        );
        assert!(
            matches!(&shape.data.commands[4], ShapeCommandToken::String(value) if value == "moveTo")
        );
        assert!(matches!(
            shape.data.commands[5],
            ShapeCommandToken::Number(2.0)
        ));
        assert!(matches!(
            shape.data.commands[6],
            ShapeCommandToken::Number(0.0)
        ));
        assert!(matches!(
            shape.data.commands[7],
            ShapeCommandToken::Number(0.0)
        ));
        assert!(
            matches!(&shape.data.commands[8], ShapeCommandToken::String(value) if value == "lineTo")
        );
        assert!(matches!(
            shape.data.commands[9],
            ShapeCommandToken::Number(2.0)
        ));
        assert!(
            matches!(shape.data.commands[10], ShapeCommandToken::Number(value) if (value - 25.6).abs() < 1e-6)
        );
        assert!(matches!(
            shape.data.commands[11],
            ShapeCommandToken::Number(0.0)
        ));
    }

    #[test]
    fn imports_a_button_as_the_display_list_of_its_up_state() {
        let record = |flags: u8, character_id: u16, depth: u16| {
            join_bytes(&[
                &[flags],
                &uint16(character_id),
                &uint16(depth),
                &create_matrix_record(1.0, 0.0, 0.0, 1.0, 40, 0),
                &create_color_transform_with_alpha(),
            ])
        };
        let face = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 400, 0, 400),
            &create_solid_shape_bytes(0x445566, &[(400, 0)]),
        ]);
        let button = join_bytes(&[
            &uint16(20),
            &[0],
            &uint16(0),
            &record(0x01, 7, 1),
            &record(0x04, 7, 2),
            &[0],
        ]);
        let placement = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(20), b"btn\0"]);
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &face),
                create_tag(34, &button),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let button: NodeRef = document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        assert_eq!(button.read().unwrap().node_fields().kind, MOVIE_CLIP_KIND);
        let mut children = Vec::new();
        get_node_children(&mut children, &button);
        assert_eq!(children.len(), 1);
        let matrix = get_node_local_matrix(&children[0]);
        assert_eq!((matrix.tx, matrix.ty), (2.0, 0.0));
    }

    #[test]
    fn splices_a_legacy_define_bits_image_with_its_shared_jpeg_tables() {
        let tables = [0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x11, 0x22, 0xff, 0xd9];
        let image = create_jpeg_header(16, 8);
        let definition = join_bytes(&[&uint16(9), &image]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(9)]);
        let source = create_swf(
            &[
                create_tag(8, &tables),
                create_tag(6, &definition),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let reference = embedded_image_reference(&document, 0);
        let reference = reference.read().unwrap();
        assert_eq!(reference.mime_type.as_deref(), Some("image/jpeg"));
        let bytes = reference.bytes.read().unwrap();
        assert_eq!(&bytes[..2], &[0xff, 0xd8]);
        assert_eq!(bytes.len(), tables.len() - 2 + image.len() - 2);
    }

    #[test]
    fn binds_a_recognized_do_action_to_the_frame_that_carries_it() {
        let source = create_swf(
            &[
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(12, &[0x07, 0x00]),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let timeline = root_timeline(&document);
        assert_eq!(
            timeline
                .read()
                .unwrap()
                .source
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .total_frames,
            2,
        );
        assert!(
            flight_timeline::get_timeline_frame_script(&timeline, &TimelineFrameArg::Frame(2))
                .is_some()
        );
        assert!(
            flight_timeline::get_timeline_frame_script(&timeline, &TimelineFrameArg::Frame(1))
                .is_none()
        );
        flight_timeline::play_timeline(&timeline);
        assert!(timeline.read().unwrap().is_playing);
        goto_and_stop_timeline(&timeline, &TimelineFrameArg::Frame(2));
        assert!(!timeline.read().unwrap().is_playing);
    }

    #[test]
    fn leaves_a_frame_whose_actions_are_not_purely_playback_commands_unbound() {
        let source = create_swf(
            &[
                create_tag(12, &[0x96, 0x02, 0x00, 0x08, 0x00, 0x07, 0x00]),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        assert!(
            flight_timeline::get_timeline_frame_script(
                &root_timeline(&document),
                &TimelineFrameArg::Frame(1),
            )
            .is_none()
        );
    }

    #[test]
    fn imports_an_edit_text_field_as_a_text_node_rather_than_flattening_it_to_paths() {
        let field = join_bytes(&[
            &uint16(12),
            &create_rectangle_record(0, 4000, 0, 800),
            &[0x80 | 0x40 | 0x20 | 0x04 | 0x01, 0x20 | 0x08],
            &uint16(7),
            &uint16(240),
            &[0x11, 0x22, 0x33, 0xff],
            &[2],
            &uint16(20),
            &uint16(40),
            &uint16(60),
            &uint16(80),
            b"varName\0",
            b"Hello\0",
        ]);
        let placement = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(12), b"score\0"]);
        let source = create_swf(
            &[
                create_tag(37, &field),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let node: NodeRef = document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        {
            let node = node.read().unwrap();
            let field = node.as_any().downcast_ref::<RichText>().unwrap();
            assert_eq!(field.node_fields().kind, RICH_TEXT_KIND);
            assert_eq!(field.data.text, "Hello");
            assert!(field.data.multiline);
            assert!(field.data.word_wrap);
            assert!(field.data.border);
            assert_eq!(field.data.text_color, 0x112233ff);
            assert_eq!((field.data.width, field.data.height), (200.0, 40.0));
            let format = field.data.default_text_format.read().unwrap();
            assert_eq!(format.align, Some(TextFormatAlign::Center));
            assert_eq!(format.indent, Some(3.0));
            assert_eq!(format.leading, Some(4.0));
            assert_eq!(format.left_margin, Some(1.0));
            assert_eq!(format.right_margin, Some(2.0));
            assert_eq!(format.size, Some(12.0));
        }
        let bounds = get_node_local_bounds_rectangle(&node);
        assert_eq!((bounds.width, bounds.height), (200.0, 40.0));
    }

    #[test]
    fn keeps_an_unreadable_image_definition_from_failing_the_whole_document() {
        let image = join_bytes(&[&uint16(1), &[0xff, 0xd8, 0xff, 0xd9]]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(1)]);
        let source = create_swf(
            &[
                create_tag(21, &image),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        assert!(document.read().unwrap().slots.is_empty());
    }

    #[test]
    fn never_panics_on_a_mutated_file_whatever_the_mutation_reaches() {
        let shape = join_bytes(&[&uint16(7), &create_rectangle_record(0, 2000, 0, 1000)]);
        let sprite = join_bytes(&[
            &uint16(20),
            &uint16(1),
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(TAG_END, &[]),
        ]);
        let linkage = join_bytes(&[&uint16(1), &uint16(20), b"Game.Clip\0"]);
        let placement = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(20), b"slot\0"]);
        let valid = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(39, &sprite),
                create_tag(9, &[1, 2, 3]),
                create_tag(76, &linkage),
                create_tag(26, &placement),
                create_tag(12, &[0x07, 0x00]),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let valid = valid.read().unwrap().to_vec();
        let mut seed = 0x1234_abcd_u32;
        let mut next = || {
            seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            seed
        };
        let mut imported = 0;
        for iteration in 0..600 {
            let mut mutant = valid.clone();
            if iteration % 3 == 0 {
                for _ in 0..4 {
                    let index = next() as usize % mutant.len();
                    mutant[index] = next() as u8;
                }
            } else if iteration % 3 == 1 {
                for _ in 0..3 {
                    let index = 8 + next() as usize % (mutant.len() - 8);
                    mutant[index] = next() as u8;
                }
            }
            let cut = if iteration % 3 == 2 {
                next() as usize % mutant.len()
            } else {
                mutant.len()
            };
            let bytes = bytes_ref(mutant[..cut].to_vec());
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                create_scene2d_from_swf(&bytes, &options(), None)
            }));
            let result = result.expect("mutated input must return a sentinel rather than panic");
            if result.is_some() {
                imported += 1;
            }
        }
        assert_eq!(imported, 171);
    }

    #[test]
    fn instantiates_a_symbol_that_was_exported_but_never_placed() {
        let source = exported_symbol_swf();
        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        assert!(children.is_empty());
    }

    #[test]
    fn keeps_the_geometry_of_a_bitmap_filled_shape_with_its_pixels_still_to_come() {
        let shape = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 800, 0, 800),
            &create_bitmap_shape_bytes(&[(0x41, 9, None)], &[(800, 0), (0, 800)]),
        ]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(7)]);
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        let drawn = children[0].read().unwrap();
        let shape = drawn.as_any().downcast_ref::<Shape>().unwrap();
        assert_eq!(shape.node_fields().kind, SHAPE_KIND);
        assert!(
            matches!(&shape.data.commands[0], ShapeCommandToken::String(value) if value == "beginTextureFill")
        );
        assert_eq!(
            shape
                .data
                .commands
                .iter()
                .filter(
                    |token| matches!(token, ShapeCommandToken::String(value) if value == "lineTo")
                )
                .count(),
            2,
        );
    }

    #[test]
    fn emits_a_lossless_bitmap_reference_synchronously_and_resolves_it_in_the_resource_pass() {
        let pixels = lossless_payload(5, 1, 1, &stored_deflate(&[0, 0x11, 0x22, 0x33]));
        let bitmap = join_bytes(&[&uint16(9), &pixels]);
        let shape = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 800, 0, 800),
            &create_bitmap_shape_bytes(&[(0x41, 9, Some(20.0))], &[(800, 0), (0, 800)]),
        ]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(7)]);
        let source = create_swf(
            &[
                create_tag(20, &bitmap),
                create_tag(32, &shape),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let texture = first_shape_texture(&document);
        let reference = embedded_image_reference(&document, 0);
        {
            let reference = reference.read().unwrap();
            assert_eq!(reference.mime_type.as_deref(), Some(SWF_LOSSLESS_MIME_TYPE));
            assert_eq!(reference.alpha_type, AlphaType::Opaque);
            assert_eq!(reference.textures.len(), 1);
            assert!(std::sync::Arc::ptr_eq(&reference.textures[0], &texture));
            assert_eq!(
                reference.state,
                flight_resource::ResourceResolutionState::Unresolved,
            );
        }
        assert!(get_texture_source(&*texture.read().unwrap()).is_none());

        resolve_lossless_images(&document);

        assert_eq!(
            reference.read().unwrap().state,
            flight_resource::ResourceResolutionState::Resolved,
        );
        let source = get_texture_source(&*texture.read().unwrap()).unwrap();
        let source = source.read().unwrap();
        assert_eq!(
            source.texture_source_fields().kind,
            BITMAP_TEXTURE_SOURCE_KIND,
        );
        assert_eq!(
            (
                source.texture_source_fields().width,
                source.texture_source_fields().height,
                source.texture_source_fields().alpha_type,
            ),
            (1, 1, AlphaType::Opaque),
        );
        let any: &dyn std::any::Any = &*source;
        assert_eq!(
            &*any.downcast_ref::<Bitmap>().unwrap().data,
            &[0x11, 0x22, 0x33, 0xff]
        );
    }

    #[test]
    fn parses_lossless_bitmap_reference_data_without_a_registered_decompressor() {
        let pixels = lossless_payload(5, 1, 1, &stored_deflate(&[0, 0x11, 0x22, 0x33]));
        let bitmap = join_bytes(&[&uint16(9), &pixels]);
        let shape = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 800, 0, 800),
            &create_bitmap_shape_bytes(&[(0x41, 9, Some(20.0))], &[(800, 0)]),
        ]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(7)]);
        let source = create_swf(
            &[
                create_tag(20, &bitmap),
                create_tag(32, &shape),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let texture = first_shape_texture(&document);
        assert!(get_texture_source(&*texture.read().unwrap()).is_none());
        assert_eq!(document.read().unwrap().image_resources.len(), 1);
        assert_eq!(
            embedded_image_reference(&document, 0).read().unwrap().state,
            flight_resource::ResourceResolutionState::Unresolved,
        );
    }

    #[test]
    fn carries_premultiplied_lossless_alpha_bytes_into_the_resolved_bitmap() {
        let pixels = lossless_payload(5, 1, 1, &stored_deflate(&[0x80, 0x40, 0x20, 0x10]));
        let bitmap = join_bytes(&[&uint16(9), &pixels]);
        let shape = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 800, 0, 800),
            &create_bitmap_shape_bytes(&[(0x41, 9, Some(20.0))], &[(800, 0), (0, 800)]),
        ]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(7)]);
        let source = create_swf(
            &[
                create_tag(36, &bitmap),
                create_tag(32, &shape),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        assert_eq!(
            embedded_image_reference(&document, 0)
                .read()
                .unwrap()
                .alpha_type,
            AlphaType::Premultiplied,
        );
        resolve_lossless_images(&document);
        let texture = first_shape_texture(&document);
        let source = get_texture_source(&*texture.read().unwrap()).unwrap();
        let source = source.read().unwrap();
        assert_eq!(
            source.texture_source_fields().alpha_type,
            AlphaType::Premultiplied,
        );
        let any: &dyn std::any::Any = &*source;
        assert_eq!(
            &*any.downcast_ref::<Bitmap>().unwrap().data,
            &[0x40, 0x20, 0x10, 0x80]
        );
    }

    #[test]
    fn samples_one_bitmap_character_through_a_texture_per_sampling_variant() {
        let image = join_bytes(&[&uint16(9), &create_jpeg_header(8, 8)]);
        let shape = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 800, 0, 800),
            &create_bitmap_shape_bytes(
                &[(0x40, 9, Some(20.0)), (0x43, 9, Some(20.0))],
                &[(800, 0), (0, 800)],
            ),
        ]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(7)]);
        let source = create_swf(
            &[
                create_tag(21, &image),
                create_tag(32, &shape),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        assert_eq!(document.read().unwrap().image_resources.len(), 1);
        let reference = embedded_image_reference(&document, 0);
        let reference = reference.read().unwrap();
        assert_eq!(reference.textures.len(), 2);
        let first = reference.textures[0].read().unwrap();
        assert_eq!(first.texture_fields().sampler.wrap_u, TextureWrap::Repeat);
        assert_eq!(
            first.texture_fields().sampler.mag_filter,
            TextureFilter::Linear
        );
        let second = reference.textures[1].read().unwrap();
        assert_eq!(
            second.texture_fields().sampler.wrap_u,
            TextureWrap::ClampToEdge,
        );
        assert_eq!(
            second.texture_fields().sampler.mag_filter,
            TextureFilter::Nearest,
        );
    }

    #[test]
    fn reads_a_jpeg_carrying_the_legacy_end_marker_between_its_tables_and_pixels() {
        let image = create_jpeg_header(32, 16);
        let legacy = join_bytes(&[
            &[0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x11, 0x22, 0xff, 0xd9],
            &image,
        ]);
        let definition = join_bytes(&[&uint16(9), &legacy]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(9)]);
        let source = create_swf(
            &[
                create_tag(21, &definition),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        assert_eq!(
            embedded_image_reference(&document, 0)
                .read()
                .unwrap()
                .mime_type
                .as_deref(),
            Some("image/jpeg"),
        );
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        let bounds = get_node_local_bounds_rectangle(&children[0]);
        assert_eq!((bounds.width, bounds.height), (32.0, 16.0));
    }

    #[test]
    fn imports_a_named_empty_shape_with_zero_bit_rect_bounds() {
        let shape = join_bytes(&[&uint16(1), &[0]]);
        let placement = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(1), b"empty\0"]);
        let source = create_swf(
            &[
                create_tag(32, &shape),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        assert_eq!(document.read().unwrap().slots.len(), 1);
        assert_eq!(
            document.read().unwrap().slots[0].read().unwrap().name,
            "empty"
        );
        let target: NodeRef = document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        let bounds = get_node_local_bounds_rectangle(&target);
        assert_eq!(
            (bounds.x, bounds.y, bounds.width, bounds.height),
            (0.0, 0.0, 0.0, 0.0),
        );
    }

    #[test]
    fn uses_a_place_object_three_class_name_as_direct_slot_linkage() {
        let placement = join_bytes(&[
            &[0x20 | 0x04 | 0x02, 0x08],
            &uint16(1),
            b"Game.ExternalAvatar\0",
            &uint16(9),
            &create_matrix_record(1.0, 0.0, 0.0, 1.0, 0, 0),
            b"externalSlot\0",
        ]);
        let source = create_swf(
            &[
                create_tag(70, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        assert_eq!(
            document.read().unwrap().slots[0]
                .read()
                .unwrap()
                .linkage
                .as_deref(),
            Some("Game.ExternalAvatar"),
        );
    }

    #[test]
    fn updates_an_existing_place_object_two_when_the_move_flag_is_set() {
        let linkage = join_bytes(&[&uint16(1), &uint16(7), b"Game.Avatar\0"]);
        let initial = join_bytes(&[
            &[0x20 | 0x04 | 0x02],
            &uint16(3),
            &uint16(7),
            &create_matrix_record(1.0, 0.0, 0.0, 1.0, 0, 0),
            b"avatarSlot\0",
        ]);
        let moved = join_bytes(&[
            &[0x01 | 0x04],
            &uint16(3),
            &create_matrix_record(2.0, 0.0, 0.0, 3.0, 40, -60),
        ]);
        let source = create_swf(
            &[
                create_tag(76, &linkage),
                create_tag(26, &initial),
                create_tag(26, &moved),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let reference = document.read().unwrap().slots[0].clone();
        let reference = reference.read().unwrap();
        assert_eq!(reference.name, "avatarSlot");
        assert_eq!(reference.linkage.as_deref(), Some("Game.Avatar"));
        let target: NodeRef = reference.target.clone();
        let matrix = get_node_local_matrix(&target);
        assert_eq!(
            (matrix.a, matrix.d, matrix.tx, matrix.ty),
            (2.0, 3.0, 2.0, -3.0),
        );
    }

    #[test]
    fn does_not_inherit_stale_fields_for_a_fresh_placement_at_an_occupied_depth() {
        let stale = join_bytes(&[&[0x20 | 0x02], &uint16(3), &uint16(7), b"staleSlot\0"]);
        let replacement = join_bytes(&[&[0x02], &uint16(3), &uint16(8)]);
        let source = create_swf(
            &[
                create_tag(26, &stale),
                create_tag(26, &replacement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        assert!(document.read().unwrap().slots.is_empty());
    }

    #[test]
    fn ignores_a_place_object_three_move_with_no_display_list_target() {
        let placement = join_bytes(&[
            &[0x01 | 0x20, 0x08],
            &uint16(1),
            b"Game.Ghost\0",
            b"ghostSlot\0",
        ]);
        let source = create_swf(
            &[
                create_tag(70, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        assert!(document.read().unwrap().slots.is_empty());
    }

    #[test]
    fn splits_a_placement_color_transform_across_node_alpha_and_a_scale_bias_adjustment() {
        let placement = join_bytes(&[
            &[0x20 | 0x08 | 0x02],
            &uint16(3),
            &uint16(7),
            &create_color_transform(&[128, 512, 256, 128], &[0, 0, 51, 0]),
            b"tinted\0",
        ]);
        let source = create_swf(
            &[
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let target: NodeRef = document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        assert_eq!(
            as_node2d_ref(&target)
                .unwrap()
                .read()
                .unwrap()
                .node2d_fields()
                .alpha,
            0.5,
        );
        let target_guard = target.read().unwrap();
        let stack = get_node_color_adjustments(&*target_guard).unwrap();
        let adjustment = stack.read().unwrap()[0].clone();
        assert_eq!(
            adjustment.read().unwrap().adjustment_fields().kind,
            "ColorScaleBiasAdjustment",
        );
        let value = get_node_runtime(&*target_guard)
            .resolved_color_scale_bias
            .clone()
            .unwrap();
        assert_eq!(value.alpha_bias, 0.0);
        assert_eq!(value.alpha_scale, 1.0);
        assert!((value.blue_bias - 0.2).abs() < 1e-6);
        assert_eq!(value.blue_scale, 1.0);
        assert_eq!(value.green_scale, 2.0);
        assert_eq!(value.red_scale, 0.5);
    }

    #[test]
    fn carries_no_color_adjustment_for_a_placement_whose_transform_only_fades() {
        let placement = join_bytes(&[
            &[0x20 | 0x08 | 0x02],
            &uint16(3),
            &uint16(7),
            &create_color_transform(&[256, 256, 256, 64], &[0, 0, 0, 0]),
            b"faded\0",
        ]);
        let source = create_swf(
            &[
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let target: NodeRef = document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        assert_eq!(
            as_node2d_ref(&target)
                .unwrap()
                .read()
                .unwrap()
                .node2d_fields()
                .alpha,
            0.25,
        );
        assert!(get_node_color_adjustments(&*target.read().unwrap()).is_none());
    }

    #[test]
    fn pre_divides_an_alpha_add_so_adjustment_and_node_alpha_compose_to_the_authored_transform() {
        let placement = join_bytes(&[
            &[0x20 | 0x08 | 0x02],
            &uint16(3),
            &uint16(7),
            &create_color_transform(&[256, 256, 256, 128], &[0, 0, 0, 51]),
            b"lifted\0",
        ]);
        let source = create_swf(
            &[
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let target: NodeRef = document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        let alpha = as_node2d_ref(&target)
            .unwrap()
            .read()
            .unwrap()
            .node2d_fields()
            .alpha;
        let target = target.read().unwrap();
        let value = get_node_runtime(&*target)
            .resolved_color_scale_bias
            .clone()
            .unwrap();
        assert_eq!(alpha, 0.5);
        assert!((value.alpha_bias - 0.4).abs() < 1e-6);
        assert!(((1.0 + value.alpha_bias) * alpha - 0.7).abs() < 1e-6);
    }

    #[test]
    fn replays_a_per_frame_color_transform_onto_the_instance_the_move_targets() {
        let initial = join_bytes(&[
            &[0x20 | 0x08 | 0x02],
            &uint16(3),
            &uint16(7),
            &create_color_transform(&[128, 256, 256, 256], &[0, 0, 0, 0]),
            b"shifting\0",
        ]);
        let shifted = join_bytes(&[
            &[0x01 | 0x08],
            &uint16(3),
            &create_color_transform(&[256, 256, 256, 256], &[64, 0, 0, 0]),
        ]);
        let inherited = join_bytes(&[&[0x01], &uint16(3)]);
        let source = create_swf(
            &[
                create_tag(26, &initial),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(26, &shifted),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(26, &inherited),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let target: NodeRef = document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        {
            let target = target.read().unwrap();
            assert_eq!(
                get_node_runtime(&*target)
                    .resolved_color_scale_bias
                    .as_ref()
                    .unwrap()
                    .red_scale,
                0.5,
            );
        }

        let timeline = root_timeline(&document);
        goto_and_stop_timeline(&timeline, &TimelineFrameArg::Frame(2));
        let second = {
            let target = target.read().unwrap();
            let value = get_node_runtime(&*target)
                .resolved_color_scale_bias
                .as_ref()
                .unwrap();
            assert_eq!(value.red_scale, 1.0);
            assert!((value.red_bias - 64.0 / 255.0).abs() < 1e-6);
            get_node_color_adjustments(&*target).unwrap()
        };

        goto_and_stop_timeline(&timeline, &TimelineFrameArg::Frame(3));
        let third = get_node_color_adjustments(&*target.read().unwrap()).unwrap();
        assert!(std::sync::Arc::ptr_eq(&second, &third));
    }

    #[test]
    fn tints_through_a_legacy_place_object_color_transform_without_an_alpha_channel() {
        let shape = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 400, 0, 400),
            &create_solid_shape_bytes(0x445566, &[(400, 0)]),
        ]);
        let placement = join_bytes(&[
            &uint16(7),
            &uint16(3),
            &create_matrix_record(1.0, 0.0, 0.0, 1.0, 0, 0),
            &create_color_transform(&[128, 256, 256], &[0, 0, 0]),
        ]);
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(4, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        assert_eq!(
            as_node2d_ref(&children[0])
                .unwrap()
                .read()
                .unwrap()
                .node2d_fields()
                .alpha,
            1.0,
        );
        let placed = children[0].read().unwrap();
        let value = get_node_runtime(&*placed)
            .resolved_color_scale_bias
            .as_ref()
            .unwrap();
        assert_eq!(value.alpha_bias, 0.0);
        assert_eq!(value.alpha_scale, 1.0);
        assert_eq!(value.red_scale, 0.5);
    }

    #[test]
    fn folds_a_fixed_function_place_object_three_blend_mode_onto_the_node() {
        let placement = join_bytes(&[
            &[0x20 | 0x02, 0x02],
            &uint16(3),
            &uint16(7),
            b"multiplied\0",
            &[3],
        ]);
        let source = create_swf(
            &[
                create_tag(70, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let target: NodeRef = document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        assert_eq!(
            as_node2d_ref(&target)
                .unwrap()
                .read()
                .unwrap()
                .node2d_fields()
                .blend_mode
                .as_deref(),
            Some(BLEND_MODE_MULTIPLY),
        );
    }

    #[test]
    fn materializes_a_placed_shape_definition_as_drawable_geometry() {
        let shape = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 2000, 0, 1000),
            &create_solid_shape_bytes(0x3366cc, &[(2000, 0), (0, 1000), (-2000, 0), (0, -1000)]),
        ]);
        let placement = join_bytes(&[
            &[0x04 | 0x02],
            &uint16(1),
            &uint16(7),
            &create_matrix_record(1.0, 0.0, 0.0, 1.0, 60, 80),
        ]);
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        assert!(document.read().unwrap().slots.is_empty());
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        let drawn = children[0].read().unwrap();
        let shape = drawn.as_any().downcast_ref::<Shape>().unwrap();
        assert_eq!(shape.node_fields().kind, SHAPE_KIND);
        assert!(SWF_TAG_NODE_KINDS[&TAG_DEFINE_SHAPE].contains(&shape.node_fields().kind));
        assert!(
            matches!(&shape.data.commands[0], ShapeCommandToken::String(value) if value == "beginFill")
        );
        assert!(matches!(shape.data.commands[1], ShapeCommandToken::Number(value) if value == 2.0));
        assert!(
            matches!(shape.data.commands[2], ShapeCommandToken::Number(value) if value == 0x3366ccff_u32 as f64)
        );
        assert!(matches!(shape.data.commands[3], ShapeCommandToken::Number(value) if value == 1.0));
        assert!(
            matches!(&shape.data.commands[4], ShapeCommandToken::String(value) if value == "moveTo")
        );
        drop(drawn);
        let matrix = get_node_local_matrix(&children[0]);
        assert_eq!((matrix.tx, matrix.ty), (3.0, 4.0));
        let bounds = get_node_local_bounds_rectangle(&children[0]);
        assert_eq!(
            (bounds.x, bounds.y, bounds.width, bounds.height),
            (0.0, 0.0, 100.0, 50.0)
        );
    }

    #[test]
    fn gives_each_placement_of_one_shape_definition_its_own_geometry() {
        let shape = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 400, 0, 400),
            &create_solid_shape_bytes(0x123456, &[(400, 0)]),
        ]);
        let first = join_bytes(&[&[0x02], &uint16(1), &uint16(7)]);
        let second = join_bytes(&[&[0x02], &uint16(2), &uint16(7)]);
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(26, &first),
                create_tag(26, &second),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        assert_eq!(children.len(), 2);
        assert!(!std::sync::Arc::ptr_eq(&children[0], &children[1]));
        let first = children[0].read().unwrap();
        let second = children[1].read().unwrap();
        let first = first.as_any().downcast_ref::<Shape>().unwrap();
        let second = second.as_any().downcast_ref::<Shape>().unwrap();
        assert_ne!(first.data.commands.as_ptr(), second.data.commands.as_ptr());
        assert_eq!(
            format!("{:?}", first.data.commands),
            format!("{:?}", second.data.commands)
        );
    }

    #[test]
    fn reads_a_characters_inverted_bounds_as_an_empty_box_without_discarding_the_file() {
        let empty = join_bytes(&[&uint16(7), &create_rectangle_record(400, -400, 300, -300)]);
        let shape = join_bytes(&[
            &uint16(8),
            &create_rectangle_record(0, 400, 0, 400),
            &create_solid_shape_bytes(0x123456, &[(400, 0)]),
        ]);
        let empty_placement = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(7), b"empty\0"]);
        let drawn_placement = join_bytes(&[&[0x02], &uint16(2), &uint16(8)]);
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &empty),
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(26, &empty_placement),
                create_tag(26, &drawn_placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let target: NodeRef = document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        let bounds = get_node_local_bounds_rectangle(&target);
        assert_eq!((bounds.width, bounds.height), (0.0, 0.0));
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        let shapes = children
            .iter()
            .filter_map(|child| {
                let child = child.read().unwrap();
                return child
                    .as_any()
                    .downcast_ref::<Shape>()
                    .map(|shape| shape.data.commands.clone());
            })
            .collect::<Vec<_>>();
        assert_eq!(shapes.len(), 1);
        assert_eq!(
            shapes[0]
                .iter()
                .filter(
                    |token| matches!(token, ShapeCommandToken::String(value) if value == "lineTo")
                )
                .count(),
            1
        );
    }

    #[test]
    fn creates_a_swf_document_with_the_authored_stage_background_default() {
        let document = create_scene2d_from_swf(&empty_swf(), &options(), None).unwrap();
        let document = document.read().unwrap();
        assert_eq!(document.source_kind.as_deref(), Some("swf"));
        assert_eq!(document.background_color, None);
        assert!(document.slots.is_empty());
    }

    #[test]
    fn imports_a_named_placement_as_a_transformed_required_slot() {
        let linkage = join_bytes(&[&uint16(1), &uint16(7), b"Game.Avatar\0"]);
        let placement = join_bytes(&[
            &[0x20 | 0x04 | 0x02],
            &uint16(3),
            &uint16(7),
            &create_matrix_record(1.5, 0.25, -0.125, 0.5, 200, -40),
            b"avatarSlot\0",
        ]);
        let source = create_swf(
            &[
                create_tag(76, &linkage),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let reference = document.read().unwrap().slots[0].clone();
        let reference = reference.read().unwrap();
        assert_eq!(reference.name, "avatarSlot");
        assert_eq!(reference.linkage.as_deref(), Some("Game.Avatar"));
        assert!(reference.required);
        assert_eq!(
            reference
                .target
                .read()
                .unwrap()
                .node_fields()
                .name
                .as_deref(),
            Some("avatarSlot")
        );
        let node: NodeRef = reference.target.clone();
        let matrix = get_node_local_matrix(&node);
        assert!((matrix.a - 1.5).abs() < 0.001);
        assert!((matrix.b - 0.25).abs() < 0.001);
        assert!((matrix.c + 0.125).abs() < 0.001);
        assert!((matrix.d - 0.5).abs() < 0.001);
        assert!((matrix.tx - 10.0).abs() < 0.001);
        assert!((matrix.ty + 2.0).abs() < 0.001);
    }

    #[test]
    fn keeps_an_unreadable_shape_as_a_bounded_named_placeholder() {
        let shape = join_bytes(&[&uint16(7), &create_rectangle_record(0, 200, 0, 100)]);
        let placement = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(7), b"boxed\0"]);
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let target = document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        assert_eq!(
            target.read().unwrap().node_fields().kind,
            DISPLAY_OBJECT_KIND
        );
        let target: NodeRef = target;
        let bounds = get_node_local_bounds_rectangle(&target);
        assert_eq!(bounds.width, 10.0);
        assert_eq!(bounds.height, 5.0);
    }

    #[test]
    fn enumerates_slots_from_every_frame_and_reuses_their_nodes_when_seeking() {
        let first = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(7), b"firstFrameSlot\0"]);
        let second = join_bytes(&[&[0x20 | 0x02], &uint16(2), &uint16(8), b"secondFrameSlot\0"]);
        let source = create_swf(
            &[
                create_tag(26, &first),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(28, &uint16(1)),
                create_tag(26, &second),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let (root, first, second) = {
            let document = document.read().unwrap();
            (
                document.root.clone(),
                document.slots[0].read().unwrap().target.clone(),
                document.slots[1].read().unwrap().target.clone(),
            )
        };
        let root_node: NodeRef = root.clone();
        let first_node: NodeRef = first.clone();
        let second_node: NodeRef = second.clone();
        assert!(std::sync::Arc::ptr_eq(
            &get_node_parent(&first_node).unwrap(),
            &root_node,
        ));
        assert!(get_node_parent(&second_node).is_none());

        let timeline = root_timeline(&document);
        goto_and_stop_timeline(&timeline, &TimelineFrameArg::Frame(2));
        assert!(get_node_parent(&first_node).is_none());
        assert!(std::sync::Arc::ptr_eq(
            &get_node_parent(&second_node).unwrap(),
            &root_node,
        ));

        goto_and_stop_timeline(&timeline, &TimelineFrameArg::Frame(1));
        let mut children = Vec::new();
        get_node_children(&mut children, &root_node);
        assert_eq!(children.len(), 1);
        assert!(std::sync::Arc::ptr_eq(&children[0], &first_node));
    }

    #[test]
    fn keeps_depth_order_when_a_later_frame_places_an_instance_between_two_others() {
        let under = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(7), b"under\0"]);
        let over = join_bytes(&[&[0x20 | 0x02], &uint16(9), &uint16(8), b"over\0"]);
        let between = join_bytes(&[&[0x20 | 0x02], &uint16(5), &uint16(9), b"between\0"]);
        let source = create_swf(
            &[
                create_tag(26, &under),
                create_tag(26, &over),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(26, &between),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        assert_eq!(
            children
                .iter()
                .map(|child| child.read().unwrap().node_fields().name.clone().unwrap())
                .collect::<Vec<_>>(),
            vec![String::from("under"), String::from("over")],
        );

        goto_and_stop_timeline(&root_timeline(&document), &TimelineFrameArg::Frame(2));
        children.clear();
        get_node_children(&mut children, &root);
        assert_eq!(
            children
                .iter()
                .map(|child| child.read().unwrap().node_fields().name.clone().unwrap())
                .collect::<Vec<_>>(),
            vec![
                String::from("under"),
                String::from("between"),
                String::from("over"),
            ],
        );
    }

    #[test]
    fn replays_a_later_frame_move_onto_the_existing_instance() {
        let initial = join_bytes(&[
            &[0x20 | 0x04 | 0x02],
            &uint16(3),
            &uint16(7),
            &create_matrix_record(1.0, 0.0, 0.0, 1.0, 20, 40),
            b"mover\0",
        ]);
        let moved = join_bytes(&[
            &[0x01 | 0x04],
            &uint16(3),
            &create_matrix_record(2.0, 0.0, 0.0, 2.0, 200, -60),
        ]);
        let source = create_swf(
            &[
                create_tag(26, &initial),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(26, &moved),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let mover = document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        let mover_node: NodeRef = mover;
        let matrix = get_node_local_matrix(&mover_node);
        assert_eq!(
            (matrix.a, matrix.d, matrix.tx, matrix.ty),
            (1.0, 1.0, 1.0, 2.0)
        );

        goto_and_stop_timeline(&root_timeline(&document), &TimelineFrameArg::Frame(2));
        let matrix = get_node_local_matrix(&mover_node);
        assert_eq!(
            (matrix.a, matrix.d, matrix.tx, matrix.ty),
            (2.0, 2.0, 10.0, -3.0)
        );
    }

    #[test]
    fn imports_frame_labels_and_header_frame_rate_as_timeline_playback_data() {
        let slot = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(7), b"slot\0"]);
        let source = create_swf(
            &[
                create_tag(43, b"intro\0"),
                create_tag(26, &slot),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(43, b"outro\0"),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(43, b"unreached\0"),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let timeline = root_timeline(&document);
        {
            let timeline = timeline.read().unwrap();
            let source = timeline.source.as_ref().unwrap().read().unwrap();
            assert_eq!(source.total_frames, 2);
            assert_eq!(source.frame_rate, Some(24.0));
            assert_eq!(
                source
                    .labels
                    .iter()
                    .map(|label| (label.frame, label.name.as_str()))
                    .collect::<Vec<_>>(),
                vec![(1, "intro"), (2, "outro")],
            );
        }

        goto_and_stop_timeline(&timeline, &TimelineFrameArg::Label(String::from("outro")));
        assert_eq!(timeline.read().unwrap().current_frame, 2);
        let label = get_timeline_current_label(&timeline).unwrap();
        assert_eq!((label.frame, label.name.as_str()), (2, "outro"));
    }

    #[test]
    fn imports_root_frame_labels_declared_by_scene_and_frame_label_data() {
        let labels = join_bytes(&[
            &encoded_uint32(1),
            &encoded_uint32(200),
            b"Scene 1\0",
            &encoded_uint32(2),
            &encoded_uint32(0),
            b"start\0",
            &encoded_uint32(1),
            b"finish\0",
        ]);
        let source = create_swf(
            &[
                create_tag(86, &labels),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let timeline = root_timeline(&document);
        let source = timeline.read().unwrap().source.clone().unwrap();
        assert_eq!(
            source
                .read()
                .unwrap()
                .labels
                .iter()
                .map(|label| (label.frame, label.name.as_str()))
                .collect::<Vec<_>>(),
            vec![(1, "start"), (2, "finish")],
        );
    }

    #[test]
    fn plays_a_nested_sprite_timeline_on_its_own_playhead() {
        let first = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(7), b"firstChild\0"]);
        let second = join_bytes(&[&[0x20 | 0x02], &uint16(2), &uint16(8), b"secondChild\0"]);
        let sprite = join_bytes(&[
            &uint16(20),
            &uint16(2),
            &create_tag(26, &first),
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(28, &uint16(1)),
            &create_tag(26, &second),
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(TAG_END, &[]),
        ]);
        let panel = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(20), b"panel\0"]);
        let source = create_swf(
            &[
                create_tag(39, &sprite),
                create_tag(26, &panel),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let (root, panel, first, second, names) = {
            let document = document.read().unwrap();
            (
                document.root.clone(),
                document.slots[0].read().unwrap().target.clone(),
                document.slots[1].read().unwrap().target.clone(),
                document.slots[2].read().unwrap().target.clone(),
                document
                    .slots
                    .iter()
                    .map(|slot| slot.read().unwrap().name.clone())
                    .collect::<Vec<_>>(),
            )
        };
        assert_eq!(names, vec!["panel", "firstChild", "secondChild"]);
        let panel: NodeRef = panel;
        let first: NodeRef = first;
        let second: NodeRef = second;
        assert_eq!(
            root_timeline(&document)
                .read()
                .unwrap()
                .source
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .total_frames,
            1,
        );
        let panel_timeline = movie_clip_timeline(&panel);
        assert_eq!(
            panel_timeline
                .read()
                .unwrap()
                .source
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .total_frames,
            2,
        );
        let mut children = Vec::new();
        get_node_children(&mut children, &panel);
        assert_eq!(children.len(), 1);
        assert!(std::sync::Arc::ptr_eq(&children[0], &first));

        goto_and_stop_timeline(&panel_timeline, &TimelineFrameArg::Frame(2));
        children.clear();
        get_node_children(&mut children, &panel);
        assert_eq!(children.len(), 1);
        assert!(std::sync::Arc::ptr_eq(&children[0], &second));
        let root: NodeRef = root;
        assert!(std::sync::Arc::ptr_eq(
            &get_node_parent(&panel).unwrap(),
            &root,
        ));
    }

    #[test]
    fn imports_every_timeline_stopped_on_its_own_looping_playhead() {
        let first = join_bytes(&[&[0x02], &uint16(1), &uint16(7)]);
        let second = join_bytes(&[&[0x02], &uint16(2), &uint16(8)]);
        let sprite = join_bytes(&[
            &uint16(20),
            &uint16(2),
            &create_tag(26, &first),
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(28, &uint16(1)),
            &create_tag(26, &second),
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(TAG_END, &[]),
        ]);
        let panel = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(20), b"panel\0"]);
        let source = create_swf(
            &[
                create_tag(39, &sprite),
                create_tag(26, &panel),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let root = root_timeline(&document);
        let panel: NodeRef = document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        let panel = movie_clip_timeline(&panel);
        assert!(!root.read().unwrap().is_playing);
        assert!(!panel.read().unwrap().is_playing);
        assert_eq!(root.read().unwrap().play_mode, TimelinePlayMode::Loop);
        assert_eq!(panel.read().unwrap().play_mode, TimelinePlayMode::Loop);

        let frame_ms = 1000.0 / 24.0;
        play_timeline(&root);
        update_timeline(&root, frame_ms);
        assert_eq!(root.read().unwrap().current_frame, 2);
        assert_eq!(panel.read().unwrap().current_frame, 1);

        play_timeline(&panel);
        update_timeline(&panel, frame_ms);
        assert_eq!(panel.read().unwrap().current_frame, 2);
        update_timeline(&panel, frame_ms);
        assert_eq!(panel.read().unwrap().current_frame, 1);
    }

    #[test]
    fn uses_a_place_object_four_class_name_as_direct_slot_linkage_while_ignoring_metadata() {
        let placement = join_bytes(&[
            &[0x20 | 0x04 | 0x02, 0x08],
            &uint16(1),
            b"Game.MetadataAvatar\0",
            &uint16(9),
            &create_matrix_record(1.0, 0.0, 0.0, 1.0, 60, 80),
            b"metadataSlot\0",
            &[0xde, 0xad, 0xbe, 0xef],
        ]);
        let source = create_swf(
            &[
                create_tag(94, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let reference = document.read().unwrap().slots[0].clone();
        let reference = reference.read().unwrap();
        assert_eq!(reference.name, "metadataSlot");
        assert_eq!(reference.linkage.as_deref(), Some("Game.MetadataAvatar"));
        let target: NodeRef = reference.target.clone();
        let matrix = get_node_local_matrix(&target);
        assert_eq!((matrix.tx, matrix.ty), (3.0, 4.0));
    }

    #[test]
    fn uses_legacy_place_object_transforms_to_import_named_sprite_descendants() {
        let shape = join_bytes(&[&uint16(7), &create_rectangle_record(0, 200, 0, 100)]);
        let child = join_bytes(&[&[0x20 | 0x02], &uint16(2), &uint16(7), b"legacyChild\0"]);
        let sprite = join_bytes(&[
            &uint16(20),
            &uint16(1),
            &create_tag(26, &child),
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(TAG_END, &[]),
        ]);
        let linkage = join_bytes(&[&uint16(1), &uint16(7), b"Game.LegacyChild\0"]);
        let placement = join_bytes(&[
            &uint16(20),
            &uint16(1),
            &create_matrix_record(2.0, 0.0, 0.0, 3.0, 100, -40),
            &create_color_transform(&[1, 1, 1], &[-1, -1, -1]),
        ]);
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(39, &sprite),
                create_tag(76, &linkage),
                create_tag(4, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let reference = document.read().unwrap().slots[0].clone();
        let reference = reference.read().unwrap();
        assert_eq!(reference.name, "legacyChild");
        assert_eq!(reference.linkage.as_deref(), Some("Game.LegacyChild"));
        let target: NodeRef = reference.target.clone();
        let world = get_node_world_matrix(&target, &mut node_revisions());
        assert_eq!(
            (world.a, world.d, world.tx, world.ty),
            (2.0, 3.0, 5.0, -2.0),
        );
    }

    #[test]
    fn applies_legacy_remove_object_before_freezing_the_first_frame() {
        let child = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(7), b"removedChild\0"]);
        let sprite = join_bytes(&[
            &uint16(20),
            &uint16(1),
            &create_tag(26, &child),
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(TAG_END, &[]),
        ]);
        let placement = join_bytes(&[
            &uint16(20),
            &uint16(4),
            &create_matrix_record(1.0, 0.0, 0.0, 1.0, 0, 0),
        ]);
        let removal = join_bytes(&[&uint16(20), &uint16(4)]);
        let source = create_swf(
            &[
                create_tag(39, &sprite),
                create_tag(4, &placement),
                create_tag(5, &removal),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        assert!(document.read().unwrap().slots.is_empty());
    }

    #[test]
    fn applies_remove_object_two_before_freezing_the_first_frame() {
        let placement = join_bytes(&[&[0x20 | 0x02], &uint16(4), &uint16(7), b"removedSlot\0"]);
        let source = create_swf(
            &[
                create_tag(26, &placement),
                create_tag(28, &uint16(4)),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        assert!(document.read().unwrap().slots.is_empty());
    }

    #[test]
    fn imports_named_slots_from_nested_define_sprite_timelines() {
        let shape = join_bytes(&[&uint16(7), &create_rectangle_record(-20, 180, -40, 160)]);
        let avatar = join_bytes(&[
            &[0x20 | 0x04 | 0x02],
            &uint16(2),
            &uint16(7),
            &create_matrix_record(1.0, 0.0, 0.0, 1.0, 40, 60),
            b"avatarSlot\0",
        ]);
        let avatar_sprite = join_bytes(&[
            &uint16(20),
            &uint16(1),
            &create_tag(26, &avatar),
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(TAG_END, &[]),
        ]);
        let intermediate = join_bytes(&[
            &[0x04 | 0x02],
            &uint16(1),
            &uint16(20),
            &create_matrix_record(2.0, 0.0, 0.0, 3.0, 20, 20),
        ]);
        let panel_sprite = join_bytes(&[
            &uint16(30),
            &uint16(1),
            &create_tag(26, &intermediate),
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(TAG_END, &[]),
        ]);
        let linkage = join_bytes(&[
            &uint16(2),
            &uint16(30),
            b"Game.Panel\0",
            &uint16(7),
            b"Game.Avatar\0",
        ]);
        let panel = join_bytes(&[
            &[0x20 | 0x04 | 0x02],
            &uint16(1),
            &uint16(30),
            &create_matrix_record(2.0, 0.0, 0.0, 3.0, 100, 40),
            b"panelSlot\0",
        ]);
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(39, &avatar_sprite),
                create_tag(39, &panel_sprite),
                create_tag(76, &linkage),
                create_tag(26, &panel),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let (panel, avatar) = {
            let document = document.read().unwrap();
            assert_eq!(document.slots.len(), 2);
            let panel = document.slots[0].read().unwrap();
            let avatar = document.slots[1].read().unwrap();
            assert_eq!(panel.name, "panelSlot");
            assert_eq!(panel.linkage.as_deref(), Some("Game.Panel"));
            assert_eq!(avatar.name, "avatarSlot");
            assert_eq!(avatar.linkage.as_deref(), Some("Game.Avatar"));
            (panel.target.clone(), avatar.target.clone())
        };
        let panel: NodeRef = panel;
        let avatar: NodeRef = avatar;
        let bounds = get_node_local_bounds_rectangle(&panel);
        assert_eq!(
            (bounds.x, bounds.y, bounds.width, bounds.height),
            (3.0, 4.0, 20.0, 30.0),
        );
        let bounds = get_node_local_bounds_rectangle(&avatar);
        assert_eq!(
            (bounds.x, bounds.y, bounds.width, bounds.height),
            (-1.0, -2.0, 10.0, 10.0),
        );
        let intermediate = get_node_parent(&avatar).unwrap();
        assert!(std::sync::Arc::ptr_eq(
            &get_node_parent(&intermediate).unwrap(),
            &panel,
        ));
        let world = get_node_world_matrix(&avatar, &mut node_revisions());
        assert_eq!(
            (world.a, world.d, world.tx, world.ty),
            (4.0, 9.0, 15.0, 32.0),
        );
    }

    #[test]
    fn preserves_authored_dimensions_from_lossless_bitmap_definitions() {
        let rgb_bitmap = join_bytes(&[&uint16(11), &[5], &uint16(32), &uint16(16)]);
        let alpha_bitmap = join_bytes(&[&uint16(12), &[3], &uint16(8), &uint16(4), &[0]]);
        let rgb_placement = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(11), b"rgbBitmap\0"]);
        let alpha_placement =
            join_bytes(&[&[0x20 | 0x02], &uint16(2), &uint16(12), b"alphaBitmap\0"]);
        let source = create_swf(
            &[
                create_tag(20, &rgb_bitmap),
                create_tag(36, &alpha_bitmap),
                create_tag(26, &rgb_placement),
                create_tag(26, &alpha_placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let (rgb, alpha) = {
            let document = document.read().unwrap();
            (
                document.slots[0].read().unwrap().target.clone(),
                document.slots[1].read().unwrap().target.clone(),
            )
        };
        let rgb: NodeRef = rgb;
        let alpha: NodeRef = alpha;
        let rgb_bounds = get_node_local_bounds_rectangle(&rgb);
        let alpha_bounds = get_node_local_bounds_rectangle(&alpha);
        assert_eq!(
            (
                rgb_bounds.x,
                rgb_bounds.y,
                rgb_bounds.width,
                rgb_bounds.height
            ),
            (0.0, 0.0, 32.0, 16.0),
        );
        assert_eq!(
            (
                alpha_bounds.x,
                alpha_bounds.y,
                alpha_bounds.width,
                alpha_bounds.height,
            ),
            (0.0, 0.0, 8.0, 4.0),
        );
    }

    #[test]
    fn materializes_an_unnamed_video_stream_through_eleven_consecutive_move_records_without_pixels()
    {
        let video = join_bytes(&[
            &uint16(4),
            &uint16(12),
            &uint16(320),
            &uint16(180),
            &[0x07, 2],
        ]);
        let placement = join_bytes(&[
            &[0x02 | 0x04],
            &uint16(2),
            &uint16(4),
            &create_matrix_record(1.0, 0.0, 0.0, 1.0, 0, 0),
        ]);
        let mut tags = vec![
            create_tag(60, &video),
            create_tag(26, &placement),
            create_tag(61, &join_bytes(&[&uint16(4), &uint16(0), &[0xde, 0xad, 0]])),
            create_tag(TAG_SHOW_FRAME, &[]),
        ];
        for movement in 1_u16..=11 {
            tags.push(create_tag(
                26,
                &join_bytes(&[&[0x01 | 0x10], &uint16(2), &uint16(movement)]),
            ));
            tags.push(create_tag(
                61,
                &join_bytes(&[&uint16(4), &uint16(movement), &[0xde, 0xad, movement as u8]]),
            ));
            tags.push(create_tag(TAG_SHOW_FRAME, &[]));
        }
        tags.push(create_tag(TAG_END, &[]));

        let document = create_scene2d_from_swf(
            &create_swf(&tags, 24.0, [0, 2000, 0, 1000]),
            &options(),
            None,
        )
        .unwrap();
        assert!(document.read().unwrap().slots.is_empty());
        let root: NodeRef = document.read().unwrap().root.clone();
        let timeline = root_timeline(&document);
        assert_eq!(
            timeline
                .read()
                .unwrap()
                .source
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .total_frames,
            12,
        );
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        let video_node = children[0].clone();
        assert_eq!(video_node.read().unwrap().node_fields().kind, SPRITE_KIND);
        let bounds = get_node_local_bounds_rectangle(&video_node);
        assert_eq!(
            (bounds.x, bounds.y, bounds.width, bounds.height),
            (0.0, 0.0, 320.0, 180.0),
        );
        let texture = video_node
            .read()
            .unwrap()
            .as_any()
            .downcast_ref::<Sprite>()
            .unwrap()
            .data
            .texture
            .clone()
            .unwrap();
        let texture = texture.read().unwrap();
        assert_eq!(texture.dimension(), TextureDimension::Texture2D);
        assert!(get_texture_source(&*texture).is_none());
        assert_eq!(
            (
                texture.texture_fields().sampler.mag_filter,
                texture.texture_fields().sampler.min_filter,
                texture.texture_fields().sampler.mipmaps,
            ),
            (TextureFilter::Linear, TextureFilter::Linear, false),
        );
        drop(texture);

        for frame in 1..=12 {
            goto_and_stop_timeline(&timeline, &TimelineFrameArg::Frame(frame));
            children.clear();
            get_node_children(&mut children, &root);
            assert_eq!(children.len(), 1);
            assert!(std::sync::Arc::ptr_eq(&children[0], &video_node));
            let matrix = get_node_local_matrix(&video_node);
            assert_eq!(
                (matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty),
                (1.0, 0.0, 0.0, 1.0, 0.0, 0.0),
            );
        }
    }

    #[test]
    fn preserves_png_and_gif_dimensions_embedded_by_define_bits_jpeg_two() {
        let png = join_bytes(&[&uint16(14), &create_png_header(48, 24)]);
        let gif = join_bytes(&[&uint16(15), &create_gif_header(17, 9)]);
        let png_placement = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(14), b"pngBitmap\0"]);
        let gif_placement = join_bytes(&[&[0x20 | 0x02], &uint16(2), &uint16(15), b"gifBitmap\0"]);
        let source = create_swf(
            &[
                create_tag(21, &png),
                create_tag(21, &gif),
                create_tag(26, &png_placement),
                create_tag(26, &gif_placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let (png, gif) = {
            let document = document.read().unwrap();
            (
                document.slots[0].read().unwrap().target.clone(),
                document.slots[1].read().unwrap().target.clone(),
            )
        };
        let png: NodeRef = png;
        let gif: NodeRef = gif;
        let png_bounds = get_node_local_bounds_rectangle(&png);
        let gif_bounds = get_node_local_bounds_rectangle(&gif);
        assert_eq!(
            (
                png_bounds.x,
                png_bounds.y,
                png_bounds.width,
                png_bounds.height,
            ),
            (0.0, 0.0, 48.0, 24.0),
        );
        assert_eq!(
            (
                gif_bounds.x,
                gif_bounds.y,
                gif_bounds.width,
                gif_bounds.height,
            ),
            (0.0, 0.0, 17.0, 9.0),
        );
    }

    #[test]
    fn bounds_define_bits_jpeg_three_and_four_before_their_alpha_payloads() {
        let jpeg3 = create_jpeg_header(64, 32);
        let jpeg4 = create_jpeg_header(31, 19);
        let jpeg3_definition = join_bytes(&[
            &uint16(16),
            &crate::support::uint32(jpeg3.len() as u32),
            &jpeg3,
            &[1, 2, 3],
        ]);
        let jpeg4_definition = join_bytes(&[
            &uint16(17),
            &crate::support::uint32((jpeg4.len() + 2) as u32),
            &uint16(0),
            &jpeg4,
            &[4, 5, 6],
        ]);
        let jpeg3_placement =
            join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(16), b"jpeg3Bitmap\0"]);
        let jpeg4_placement =
            join_bytes(&[&[0x20 | 0x02], &uint16(2), &uint16(17), b"jpeg4Bitmap\0"]);
        let source = create_swf(
            &[
                create_tag(35, &jpeg3_definition),
                create_tag(90, &jpeg4_definition),
                create_tag(26, &jpeg3_placement),
                create_tag(26, &jpeg4_placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let document = create_scene2d_from_swf(&source, &options(), None).unwrap();
        let (jpeg3, jpeg4) = {
            let document = document.read().unwrap();
            (
                document.slots[0].read().unwrap().target.clone(),
                document.slots[1].read().unwrap().target.clone(),
            )
        };
        let jpeg3: NodeRef = jpeg3;
        let jpeg4: NodeRef = jpeg4;
        let jpeg3_bounds = get_node_local_bounds_rectangle(&jpeg3);
        let jpeg4_bounds = get_node_local_bounds_rectangle(&jpeg4);
        assert_eq!(
            (
                jpeg3_bounds.x,
                jpeg3_bounds.y,
                jpeg3_bounds.width,
                jpeg3_bounds.height,
            ),
            (0.0, 0.0, 64.0, 32.0),
        );
        assert_eq!(
            (
                jpeg4_bounds.x,
                jpeg4_bounds.y,
                jpeg4_bounds.width,
                jpeg4_bounds.height,
            ),
            (0.0, 0.0, 31.0, 19.0),
        );
    }

    #[test]
    fn rejects_compressed_and_truncated_inputs_without_panicking() {
        let compressed = create_swf(&[create_tag(TAG_END, &[])], 24.0, [0, 2000, 0, 1000]);
        let compressed = {
            let mut compressed = compressed.read().unwrap().to_vec();
            compressed[0] = 0x43;
            bytes_ref(compressed)
        };
        assert!(create_scene2d_from_swf(&compressed, &options(), None).is_none());
        assert!(
            create_scene2d_from_swf(&bytes_ref(vec![0x46, 0x57, 0x53]), &options(), None).is_none()
        );

        let truncated_video = create_swf(
            &[
                create_tag(
                    60,
                    &join_bytes(&[&uint16(1), &uint16(10), &uint16(320), &uint16(180), &[0]]),
                ),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        assert!(create_scene2d_from_swf(&truncated_video, &options(), None).is_none());

        let truncated_place = create_swf(
            &[
                create_tag(4, &join_bytes(&[&uint16(7), &uint16(1)])),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        assert!(create_scene2d_from_swf(&truncated_place, &options(), None).is_none());

        let truncated_remove = create_swf(
            &[create_tag(5, &uint16(7)), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );
        assert!(create_scene2d_from_swf(&truncated_remove, &options(), None).is_none());

        let truncated_place_four = create_swf(
            &[
                create_tag(94, &[0x20 | 0x02, 0x08]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        assert!(create_scene2d_from_swf(&truncated_place_four, &options(), None).is_none());

        let truncated_lossless = create_swf(
            &[
                create_tag(20, &join_bytes(&[&[1, 0, 5], &uint16(32)])),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        assert!(create_scene2d_from_swf(&truncated_lossless, &options(), None).is_none());

        let invalid_alpha_lossless = create_swf(
            &[
                create_tag(36, &join_bytes(&[&uint16(1), &[4], &uint16(8), &uint16(4)])),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        assert!(create_scene2d_from_swf(&invalid_alpha_lossless, &options(), None).is_none());

        let duplicate_character = create_swf(
            &[
                create_tag(20, &join_bytes(&[&uint16(1), &[5], &uint16(8), &uint16(4)])),
                create_tag(
                    60,
                    &join_bytes(&[&uint16(1), &uint16(10), &uint16(320), &uint16(180), &[0, 2]]),
                ),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        assert!(create_scene2d_from_swf(&duplicate_character, &options(), None).is_none());
    }

    #[test]
    fn rejects_a_timeline_that_multiplies_a_small_display_list_past_the_frame_budget() {
        let mut tags = Vec::new();
        for depth in 1_u16..=200 {
            tags.push(create_tag(
                26,
                &join_bytes(&[&[0x02], &uint16(depth), &uint16(7)]),
            ));
        }
        for _frame in 0..5001 {
            tags.push(create_tag(TAG_SHOW_FRAME, &[]));
        }
        tags.push(create_tag(TAG_END, &[]));

        let source = create_swf(&tags, 24.0, [0, 2000, 0, 1000]);
        assert!(create_scene2d_from_swf(&source, &options(), None).is_none());
    }

    #[test]
    fn rejects_a_recursive_sprite_graph_without_overflowing() {
        let recursive_child =
            join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(1), b"recursiveChild\0"]);
        let sprite = join_bytes(&[
            &uint16(1),
            &uint16(1),
            &create_tag(26, &recursive_child),
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(TAG_END, &[]),
        ]);
        let recursive_root =
            join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(1), b"recursiveRoot\0"]);
        let source = create_swf(
            &[
                create_tag(39, &sprite),
                create_tag(26, &recursive_root),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        assert!(create_scene2d_from_swf(&source, &options(), None).is_none());
    }
}

mod create_scene2d_import_from_swf {
    use super::*;

    #[test]
    fn retains_exact_jpeg_three_and_four_color_and_alpha_ranges_on_the_full_import_report() {
        let jpeg3 = create_jpeg_header(23, 17);
        let alpha3 = [0x78, 0x01, 0x31, 0x32, 0x33];
        let jpeg4 = create_jpeg_header(31, 19);
        let alpha4 = [0x78, 0x01, 0x41, 0x42, 0x43];
        let deblocking_parameter_raw = 0x81fe;
        let jpeg3_body = join_bytes(&[&uint16(16), &uint32(jpeg3.len() as u32), &jpeg3, &alpha3]);
        let jpeg4_body = join_bytes(&[
            &uint16(17),
            &uint32((jpeg4.len() + 2) as u32),
            &uint16(deblocking_parameter_raw),
            &jpeg4,
            &alpha4,
        ]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(16)]);
        let source = create_swf(
            &[
                create_tag(35, &jpeg3_body),
                create_tag(90, &jpeg4_body),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let result = create_scene2d_import_from_swf(&source, &options(), None).unwrap();
        let result = result.read().unwrap();
        assert_eq!(result.jpeg_alpha_payloads.len(), 2);
        let jpeg3_payload = &result.jpeg_alpha_payloads[0];
        let jpeg4_payload = &result.jpeg_alpha_payloads[1];
        assert_eq!(jpeg3_payload.character_id, 16);
        assert_eq!(jpeg3_payload.deblocking_parameter_raw, None);
        assert_eq!(jpeg3_payload.height, 17);
        assert_eq!(jpeg3_payload.width, 23);
        assert_eq!(jpeg4_payload.character_id, 17);
        assert_eq!(
            jpeg4_payload.deblocking_parameter_raw,
            Some(deblocking_parameter_raw),
        );
        assert_eq!(jpeg4_payload.height, 19);
        assert_eq!(jpeg4_payload.width, 31);
        assert!(std::sync::Arc::ptr_eq(
            &jpeg3_payload.reference,
            &embedded_image_reference(&result.document, 0),
        ));
        assert!(jpeg4_payload.reference.read().unwrap().textures.is_empty());
        assert_eq!(
            &**jpeg3_payload
                .reference
                .read()
                .unwrap()
                .bytes
                .read()
                .unwrap(),
            &jpeg3
        );
        assert_eq!(&*jpeg3_payload.compressed_alpha_bytes, &alpha3);
        assert_eq!(
            &**jpeg4_payload
                .reference
                .read()
                .unwrap()
                .bytes
                .read()
                .unwrap(),
            &jpeg4
        );
        assert_eq!(&*jpeg4_payload.compressed_alpha_bytes, &alpha4);
    }

    #[test]
    fn rejects_jpeg_alpha_offsets_outside_the_tag_color_range() {
        let jpeg3 = create_jpeg_header(23, 17);
        let jpeg4 = create_jpeg_header(31, 19);
        let jpeg3_body = join_bytes(&[&uint16(16), &uint32((jpeg3.len() + 1) as u32), &jpeg3]);
        let jpeg4_body = join_bytes(&[&uint16(17), &uint32(1), &uint16(0x1234), &jpeg4]);
        let first = join_bytes(&[&[0x02], &uint16(1), &uint16(16)]);
        let second = join_bytes(&[&[0x02], &uint16(2), &uint16(17)]);
        let source = create_swf(
            &[
                create_tag(35, &jpeg3_body),
                create_tag(90, &jpeg4_body),
                create_tag(26, &first),
                create_tag(26, &second),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let result = create_scene2d_import_from_swf(&source, &options(), None).unwrap();
        let result = result.read().unwrap();
        assert!(result.jpeg_alpha_payloads.is_empty());
        assert!(result.document.read().unwrap().image_resources.is_empty());
    }

    #[test]
    fn does_not_invent_a_trailing_blend_mode_from_an_unknown_filter_payload() {
        let placement = join_bytes(&[
            &[0x20 | 0x02, 0x01 | 0x02],
            &uint16(3),
            &uint16(7),
            b"unknown-filter\0",
            &[1, 0xfe, 13, 3],
        ]);
        let source = create_swf(
            &[
                create_tag(70, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let result = create_scene2d_import_from_swf(&source, &options(), None).unwrap();
        let result = result.read().unwrap();
        let node = result.document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        assert_eq!(
            node.read().unwrap().node2d_fields().blend_mode.as_deref(),
            Some(BLEND_MODE_NORMAL),
        );
        assert!(result.appearances.is_empty());
    }

    #[test]
    fn reports_a_placement_filter_list_as_effect_descriptors_and_attaches_nothing() {
        let placement = join_bytes(&[
            &[0x20 | 0x02, 0x01],
            &uint16(3),
            &uint16(7),
            b"blurred\0",
            &[1, 1],
            &uint32(4 * 65_536),
            &uint32(2 * 65_536),
            &[0],
        ]);
        let source = create_swf(
            &[
                create_tag(70, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let result = create_scene2d_import_from_swf(&source, &options(), None).unwrap();
        let result = result.read().unwrap();
        let blurred = result.document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        assert_eq!(result.appearances.len(), 1);
        let appearance = &result.appearances[0];
        assert!(appearance.advanced_blend_mode.is_none());
        assert_eq!(appearance.frame, 1);
        assert!(std::sync::Arc::ptr_eq(&appearance.node, &blurred));
        assert_eq!(appearance.effects.len(), 1);
        let effect = appearance.effects[0].read().unwrap();
        assert_eq!(effect.effect_fields().kind, "BlurEffect");
        let blur = effect
            .as_any()
            .downcast_ref::<flight_effects::BlurEffect>()
            .unwrap();
        assert_eq!(blur.blur_x, Some(4.0));
        assert_eq!(blur.blur_y, Some(2.0));
    }

    #[test]
    fn joins_a_color_matrix_filter_onto_the_node_adjustments() {
        let mut placement = join_bytes(&[
            &[0x20 | 0x02, 0x01],
            &uint16(3),
            &uint16(7),
            b"remapped\0",
            &[1, 6],
        ]);
        for index in 0..20 {
            let value = if index % 6 == 0 { 1.0_f32 } else { 0.0_f32 };
            placement.extend_from_slice(&value.to_le_bytes());
        }
        let source = create_swf(
            &[
                create_tag(70, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let result = create_scene2d_import_from_swf(&source, &options(), None).unwrap();
        let result = result.read().unwrap();
        let remapped = result.document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        assert!(result.appearances.is_empty());
        let remapped = remapped.read().unwrap();
        let adjustments = get_node_color_adjustments(&*remapped).unwrap();
        assert_eq!(
            adjustments.read().unwrap()[0]
                .read()
                .unwrap()
                .adjustment_fields()
                .kind,
            "ColorMatrixAdjustment",
        );
    }

    #[test]
    fn reports_appearance_per_frame_until_a_later_frame_drops_the_filter_list() {
        let initial = join_bytes(&[
            &[0x20 | 0x02, 0x01],
            &uint16(3),
            &uint16(7),
            b"fading\0",
            &[1, 1],
            &uint32(65_536),
            &uint32(65_536),
            &[0],
        ]);
        let removal = join_bytes(&[&[0x01, 0x01], &uint16(3), &[0]]);
        let source = create_swf(
            &[
                create_tag(70, &initial),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(70, &removal),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let result = create_scene2d_import_from_swf(&source, &options(), None).unwrap();
        assert_eq!(
            result
                .read()
                .unwrap()
                .appearances
                .iter()
                .map(|appearance| appearance.frame)
                .collect::<Vec<_>>(),
            vec![1],
        );
    }

    #[test]
    fn removes_a_declared_color_matrix_without_dropping_the_inherited_color_transform() {
        let mut initial = join_bytes(&[
            &[0x20 | 0x08 | 0x02, 0x01],
            &uint16(3),
            &uint16(7),
            &create_color_transform(&[128, 256, 256, 256], &[0, 0, 0, 0]),
            b"remapped\0",
            &[1, 6],
        ]);
        for index in 0..20 {
            let value = if index % 6 == 0 { 1.0_f32 } else { 0.0_f32 };
            initial.extend_from_slice(&value.to_le_bytes());
        }
        let removal = join_bytes(&[&[0x01, 0x01], &uint16(3), &[0]]);
        let source = create_swf(
            &[
                create_tag(70, &initial),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(70, &removal),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let result = create_scene2d_import_from_swf(&source, &options(), None).unwrap();
        let result = result.read().unwrap();
        let remapped: NodeRef = result.document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        assert_eq!(
            get_node_color_adjustments(&*remapped.read().unwrap())
                .unwrap()
                .read()
                .unwrap()
                .len(),
            2,
        );
        goto_and_stop_timeline(
            &root_timeline(&result.document),
            &TimelineFrameArg::Frame(2),
        );
        let remapped = remapped.read().unwrap();
        let adjustments = get_node_color_adjustments(&*remapped).unwrap();
        let adjustments = adjustments.read().unwrap();
        assert_eq!(adjustments.len(), 1);
        let adjustment = adjustments[0].read().unwrap();
        assert_eq!(
            adjustment.adjustment_fields().kind,
            "ColorScaleBiasAdjustment",
        );
        assert_eq!(adjustment.adjustment_fields().color_matrix.unwrap()[0], 0.5,);
    }

    #[test]
    fn returns_the_document_and_empty_appearance_sidecars_for_plain_content() {
        let result = create_scene2d_import_from_swf(&empty_swf(), &options(), None).unwrap();
        let result = result.read().unwrap();
        assert!(result.appearances.is_empty());
        assert!(result.jpeg_alpha_payloads.is_empty());
        assert_eq!(
            result.document.read().unwrap().source_kind.as_deref(),
            Some("swf")
        );
    }

    #[test]
    fn reports_an_advanced_blend_beside_the_node_that_cannot_carry_it() {
        let placement = join_bytes(&[
            &[0x20 | 0x02, 0x02],
            &uint16(3),
            &uint16(7),
            b"overlaid\0",
            &[13],
        ]);
        let source = create_swf(
            &[
                create_tag(70, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let result = create_scene2d_import_from_swf(&source, &options(), None).unwrap();
        let result = result.read().unwrap();
        let node = result.document.read().unwrap().slots[0]
            .read()
            .unwrap()
            .target
            .clone();
        assert_eq!(
            node.read().unwrap().node2d_fields().blend_mode.as_deref(),
            Some(BLEND_MODE_NORMAL),
        );
        assert_eq!(result.appearances.len(), 1);
        assert_eq!(
            result.appearances[0].advanced_blend_mode.as_deref(),
            Some(ADVANCED_BLEND_MODE_OVERLAY),
        );
        assert_eq!(result.appearances[0].frame, 1);
        assert!(result.appearances[0].effects.is_empty());
        assert!(std::sync::Arc::ptr_eq(&result.appearances[0].node, &node,));
    }
}

mod create_scene2d_symbol_from_swf {
    use super::*;

    #[test]
    fn builds_a_fresh_instance_of_a_symbol_the_file_exported_but_never_placed() {
        let source = exported_symbol_swf();
        let first = create_scene2d_symbol_from_swf(&source, "Layout", &options(), None).unwrap();
        let second = create_scene2d_symbol_from_swf(&source, "Layout", &options(), None).unwrap();
        let first = first.read().unwrap();
        let second = second.read().unwrap();
        assert_eq!(
            first.root.read().unwrap().node_fields().kind,
            MOVIE_CLIP_KIND
        );
        let root: NodeRef = first.root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        assert_eq!(children.len(), 1);
        assert!(!std::sync::Arc::ptr_eq(&first.root, &second.root));
    }

    #[test]
    fn carries_the_named_slots_inside_the_exported_symbol() {
        let symbol =
            create_scene2d_symbol_from_swf(&exported_symbol_swf(), "Layout", &options(), None)
                .unwrap();
        let symbol = symbol.read().unwrap();
        assert_eq!(symbol.slots.len(), 1);
        assert_eq!(symbol.slots[0].read().unwrap().name, "art");
        let root: NodeRef = symbol.root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        let target: NodeRef = symbol.slots[0].read().unwrap().target.clone();
        assert!(std::sync::Arc::ptr_eq(&target, &children[0]));
    }

    #[test]
    fn carries_a_lossless_bitmap_reference_the_symbol_resource_pass_can_resolve() {
        let pixels = lossless_payload(5, 1, 1, &stored_deflate(&[0, 0x11, 0x22, 0x33]));
        let bitmap = join_bytes(&[&uint16(9), &pixels]);
        let shape = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 800, 0, 800),
            &create_bitmap_shape_bytes(&[(0x41, 9, Some(20.0))], &[(800, 0), (0, 800)]),
        ]);
        let export = join_bytes(&[&uint16(1), &uint16(7), b"Art\0"]);
        let source = create_swf(
            &[
                create_tag(20, &bitmap),
                create_tag(32, &shape),
                create_tag(56, &export),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let symbol = create_scene2d_symbol_from_swf(&source, "Art", &options(), None).unwrap();
        let root: NodeRef = symbol.read().unwrap().root.clone();
        let texture = shape_texture(&root);
        assert!(get_texture_source(&*texture.read().unwrap()).is_none());
        assert_eq!(symbol.read().unwrap().image_resources.len(), 1);

        resolve_lossless_images(&symbol);

        let source = get_texture_source(&*texture.read().unwrap()).unwrap();
        let source = source.read().unwrap();
        let any: &dyn std::any::Any = &*source;
        assert_eq!(
            &*any.downcast_ref::<Bitmap>().unwrap().data,
            &[0x11, 0x22, 0x33, 0xff],
        );
    }

    #[test]
    fn hands_an_encoded_bitmap_out_with_the_symbols_waiting_texture() {
        let image = join_bytes(&[&uint16(9), &create_jpeg_header(2, 3)]);
        let shape = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 800, 0, 800),
            &create_bitmap_shape_bytes(&[(0x41, 9, Some(20.0))], &[(800, 0), (0, 800)]),
        ]);
        let export = join_bytes(&[&uint16(1), &uint16(7), b"Art\0"]);
        let source = create_swf(
            &[
                create_tag(21, &image),
                create_tag(32, &shape),
                create_tag(56, &export),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let symbol = create_scene2d_symbol_from_swf(&source, "Art", &options(), None).unwrap();
        let root: NodeRef = symbol.read().unwrap().root.clone();
        let texture = shape_texture(&root);
        let reference = embedded_image_reference(&symbol, 0);
        let reference = reference.read().unwrap();
        assert_eq!(reference.mime_type.as_deref(), Some("image/jpeg"));
        assert!(
            reference
                .textures
                .iter()
                .any(|candidate| std::sync::Arc::ptr_eq(candidate, &texture))
        );
    }

    #[test]
    fn instantiates_an_exported_video_stream_as_a_sourceless_sprite() {
        let video = join_bytes(&[
            &uint16(13),
            &uint16(10),
            &uint16(320),
            &uint16(180),
            &[0, 2],
        ]);
        let export = join_bytes(&[&uint16(1), &uint16(13), b"Video\0"]);
        let source = create_swf(
            &[
                create_tag(60, &video),
                create_tag(56, &export),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let symbol = create_scene2d_symbol_from_swf(&source, "Video", &options(), None).unwrap();
        let root = {
            let symbol = symbol.read().unwrap();
            assert!(symbol.slots.is_empty());
            symbol.root.clone()
        };
        assert_eq!(root.read().unwrap().node_fields().kind, SPRITE_KIND);
        let root_node: NodeRef = root.clone();
        let bounds = get_node_local_bounds_rectangle(&root_node);
        assert_eq!(
            (bounds.x, bounds.y, bounds.width, bounds.height),
            (0.0, 0.0, 320.0, 180.0),
        );
        let texture = root
            .read()
            .unwrap()
            .as_any()
            .downcast_ref::<Sprite>()
            .unwrap()
            .data
            .texture
            .clone()
            .unwrap();
        let texture = texture.read().unwrap();
        assert!(get_texture_source(&*texture).is_none());
        assert_eq!(
            (
                texture.texture_fields().sampler.mag_filter,
                texture.texture_fields().sampler.min_filter,
                texture.texture_fields().sampler.mipmaps,
            ),
            (TextureFilter::Nearest, TextureFilter::Nearest, false),
        );
    }

    #[test]
    fn instantiates_a_bitmap_character_exported_by_linkage() {
        let image = join_bytes(&[&uint16(9), &create_jpeg_header(2, 3)]);
        let export = join_bytes(&[&uint16(1), &uint16(9), b"Pixels\0"]);
        let source = create_swf(
            &[
                create_tag(21, &image),
                create_tag(56, &export),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );

        let symbol = create_scene2d_symbol_from_swf(&source, "Pixels", &options(), None).unwrap();
        assert_eq!(
            symbol
                .read()
                .unwrap()
                .root
                .read()
                .unwrap()
                .node_fields()
                .kind,
            SPRITE_KIND,
        );
        assert_eq!(symbol.read().unwrap().image_resources.len(), 1);
    }

    #[test]
    fn reports_an_unknown_linkage_name_separately_from_a_parse_failure() {
        let mut diagnostics = Vec::new();
        assert!(
            create_scene2d_symbol_from_swf(
                &empty_swf(),
                "absent",
                &options(),
                Some(&mut diagnostics),
            )
            .is_none()
        );
        assert_eq!(
            diagnostics
                .iter()
                .map(|entry| entry.kind.as_str())
                .collect::<Vec<_>>(),
            vec!["swf.unknown-linkage-name"]
        );
        assert_eq!(
            diagnostics[0].detail.as_ref().unwrap(),
            &std::collections::HashMap::from([(
                String::from("linkageName"),
                ImportDiagnosticDetailValue::String(String::from("absent")),
            )])
        );
    }

    #[test]
    fn creates_fresh_symbol_instances_with_their_named_slots() {
        let child = join_bytes(&[&[0x20 | 0x02], &uint16(1), &uint16(8), b"innerSlot\0"]);
        let sprite = join_bytes(&[
            &uint16(7),
            &uint16(1),
            &create_tag(26, &child),
            &create_tag(TAG_SHOW_FRAME, &[]),
            &create_tag(TAG_END, &[]),
        ]);
        let linkage = join_bytes(&[&uint16(1), &uint16(7), b"Game.Layout\0"]);
        let source = create_swf(
            &[
                create_tag(39, &sprite),
                create_tag(76, &linkage),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let first =
            create_scene2d_symbol_from_swf(&source, "Game.Layout", &options(), None).unwrap();
        let second =
            create_scene2d_symbol_from_swf(&source, "Game.Layout", &options(), None).unwrap();
        let first = first.read().unwrap();
        let second = second.read().unwrap();
        assert!(!std::sync::Arc::ptr_eq(&first.root, &second.root));
        assert_eq!(first.background_color, None);
        assert_eq!(first.slots.len(), 1);
        assert_eq!(first.slots[0].read().unwrap().name, "innerSlot");
    }
}

mod initialize_swf_document_import {
    use super::*;

    #[test]
    fn keeps_the_defining_document_and_clears_authored_sidecars() {
        let imported = create_scene2d_import_from_swf(&empty_swf(), &options(), None).unwrap();
        let document = create_scene2d_document();
        initialize_swf_document_import(&mut imported.write().unwrap(), document.clone());
        let imported = imported.read().unwrap();
        assert!(std::sync::Arc::ptr_eq(&imported.document, &document));
        assert!(imported.appearances.is_empty());
        assert!(imported.jpeg_alpha_payloads.is_empty());
    }
}

mod read_swf_exported_symbol_names {
    use super::*;

    #[test]
    fn lists_every_exported_linkage_name_placed_or_not() {
        assert_eq!(
            read_swf_exported_symbol_names(&exported_symbol_swf(), &options()),
            vec![String::from("Layout")],
        );
    }

    #[test]
    fn preserves_export_order() {
        let body = join_bytes(&[&uint16(2), &uint16(4), b"First\0", &uint16(2), b"Second\0"]);
        let source = create_swf(
            &[create_tag(56, &body), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );
        assert_eq!(
            read_swf_exported_symbol_names(&source, &options()),
            vec![String::from("First"), String::from("Second")]
        );
    }

    #[test]
    fn reports_an_empty_list_instead_of_throwing_for_unreadable_bytes() {
        assert!(read_swf_exported_symbol_names(&bytes_ref(vec![1, 2, 3]), &options()).is_empty(),);
    }
}

mod register_swf_scene2d_document_importer {
    use super::*;

    #[test]
    fn registers_the_signature_and_mime_matcher_with_a_working_importer() {
        let mut registry = create_scene2d_document_importer_registry();
        register_swf_scene2d_document_importer(&mut registry, &options());
        assert_eq!(registry.entries.len(), 1);
        assert_eq!(registry.entries[0].kind, "swf");
        let source = empty_swf();
        let source = source.read().unwrap();
        let context = flight_scene2d_resources::Scene2DDocumentImportContext {
            mime_type: None,
            url: None,
        };
        assert!((registry.entries[0].matches)(&source, &context));
        assert!((registry.entries[0].import_document)(&source, &context).is_some());
    }
}

mod uncompress_swf_source {
    use super::*;

    #[test]
    fn returns_none_for_empty_input() {
        assert!(
            uncompress_swf_source(
                &bytes_ref(Vec::new()),
                Some(&SDK_HOST_DECOMPRESS_DEFLATE),
                None,
                None
            )
            .is_none()
        );
    }

    #[test]
    fn returns_the_same_uncompressed_bytes_for_an_fws_file() {
        let source = create_swf(&[create_tag(TAG_END, &[])], 24.0, [0, 2000, 0, 1000]);
        let result =
            uncompress_swf_source(&source, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None, None).unwrap();
        assert!(std::sync::Arc::ptr_eq(&source, &result));
        let result = result.read().unwrap();
        assert_eq!(&result[..3], &[0x46, 0x57, 0x53]);
    }
}
