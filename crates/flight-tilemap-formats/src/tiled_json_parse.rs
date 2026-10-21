//! JSON front-end of the Tiled codec: TMJ maps and standalone TSJ tilesets
//! (TS `tiledJsonParse.ts`).

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};

use crate::tiled_color::parse_tiled_color;
use crate::tiled_layer_data::{decode_tiled_base64_layer, decode_tiled_csv_layer};
use crate::types::*;

type JsonObject = serde_json::Map<String, serde_json::Value>;

pub fn parse_tiled_tileset_json(
    text: &str,
    _options: Option<&TiledParseOptions>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<TiledTileset> {
    let root = parse_json(text);
    let Some(root) = root else {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "tiled.json-malformed",
            "parseTiledTilesetJson",
            detail_map(&[("path", ImportDiagnosticDetailValue::String("tileset".to_string()))]),
        );
        return None;
    };
    return Some(build_tiled_tileset_from_json(&root, diagnostics, "tileset"));
}

pub fn parse_tiled_tmj(
    text: &str,
    options: Option<&TiledParseOptions>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<TiledMap> {
    let root = parse_json(text);
    let Some(root) = root else {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "tiled.json-malformed",
            "parseTiledTmj",
            detail_map(&[("path", ImportDiagnosticDetailValue::String("map".to_string()))]),
        );
        return None;
    };
    if diagnostics.is_some() {
        // We need to split diagnostics borrow for the report calls
    }
    let mut diag_vec: Vec<ImportDiagnostic> = Vec::new();
    let use_diag = diagnostics.is_some();

    if use_diag {
        report_missing_json_field(&root, "height", &mut diag_vec, "parseTiledTmj", "map");
        report_missing_json_field(&root, "tileheight", &mut diag_vec, "parseTiledTmj", "map");
        report_missing_json_field(&root, "tilewidth", &mut diag_vec, "parseTiledTmj", "map");
        report_missing_json_field(&root, "width", &mut diag_vec, "parseTiledTmj", "map");
    }

    let background = str_field(&root, "backgroundcolor");
    let hex_side = root.get("hexsidelength").and_then(|v| v.as_f64());

    let layers_arr = array_field(&root, "layers");
    let mut layers = Vec::new();
    for (index, layer_obj) in layers_arr.iter().enumerate() {
        let path = if use_diag {
            format!("map.layers[{}]", index)
        } else {
            String::new()
        };
        let layer = build_tiled_layer_from_json(layer_obj, options, &mut diag_vec, use_diag, &path);
        if let Some(layer) = layer {
            layers.push(layer);
        }
    }

    let tilesets_arr = array_field(&root, "tilesets");
    let tilesets: Vec<TiledTilesetRef> = tilesets_arr
        .iter()
        .enumerate()
        .map(|(index, ts_obj)| {
            let path = if use_diag {
                format!("map.tilesets[{}]", index)
            } else {
                String::new()
            };
            build_tiled_tileset_ref_from_json(ts_obj, &mut diag_vec, use_diag, &path)
        })
        .collect();

    let map = TiledMap {
        background_color: background.and_then(|b| parse_tiled_color(&b)),
        height: num_field(&root, "height", 0.0) as i32,
        hex_side_length: hex_side.map(|h| h as i32),
        infinite: bool_field(&root, "infinite", false),
        stagger_axis: as_stagger_axis(str_field(&root, "staggeraxis").as_deref()),
        stagger_index: as_stagger_index(str_field(&root, "staggerindex").as_deref()),
        layers,
        orientation: as_orientation(str_field(&root, "orientation").as_deref()),
        properties: build_tiled_properties_from_json(&root),
        render_order: as_render_order(str_field(&root, "renderorder").as_deref()),
        tile_height: num_field(&root, "tileheight", 0.0) as i32,
        tile_width: num_field(&root, "tilewidth", 0.0) as i32,
        tiled_version: str_field(&root, "tiledversion"),
        tilesets,
        version: string_or(num_or_string(root.get("version")), "1.0"),
        width: num_field(&root, "width", 0.0) as i32,
    };

    if let Some(diagnostics) = diagnostics {
        diagnostics.extend(diag_vec);
    }

    return Some(map);
}

fn array_field(obj: &JsonObject, key: &str) -> Vec<JsonObject> {
    let Some(value) = obj.get(key) else {
        return Vec::new();
    };
    let Some(arr) = value.as_array() else {
        return Vec::new();
    };
    return arr
        .iter()
        .filter_map(|v| v.as_object().cloned())
        .collect();
}

fn as_compression(value: Option<&str>) -> Option<TiledCompression> {
    return match value {
        Some("gzip") => Some(TiledCompression::Gzip),
        Some("zlib") => Some(TiledCompression::Zlib),
        Some("zstd") => Some(TiledCompression::Zstd),
        _ => None,
    };
}

fn as_orientation(value: Option<&str>) -> TiledOrientation {
    return match value {
        Some("isometric") => TiledOrientation::Isometric,
        Some("staggered") => TiledOrientation::Staggered,
        Some("hexagonal") => TiledOrientation::Hexagonal,
        _ => TiledOrientation::Orthogonal,
    };
}

fn as_property_type(value: Option<&str>) -> TiledPropertyType {
    return match value {
        Some("int") => TiledPropertyType::Int,
        Some("float") => TiledPropertyType::Float,
        Some("bool") => TiledPropertyType::Bool,
        Some("color") => TiledPropertyType::Color,
        Some("file") => TiledPropertyType::File,
        Some("object") => TiledPropertyType::Object,
        _ => TiledPropertyType::String,
    };
}

fn as_render_order(value: Option<&str>) -> TiledRenderOrder {
    return match value {
        Some("right-up") => TiledRenderOrder::RightUp,
        Some("left-down") => TiledRenderOrder::LeftDown,
        Some("left-up") => TiledRenderOrder::LeftUp,
        _ => TiledRenderOrder::RightDown,
    };
}

fn as_object_alignment(value: Option<&str>) -> TiledObjectAlignment {
    return match value {
        Some("topleft") => TiledObjectAlignment::TopLeft,
        Some("top") => TiledObjectAlignment::Top,
        Some("topright") => TiledObjectAlignment::TopRight,
        Some("left") => TiledObjectAlignment::Left,
        Some("center") => TiledObjectAlignment::Center,
        Some("right") => TiledObjectAlignment::Right,
        Some("bottomleft") => TiledObjectAlignment::BottomLeft,
        Some("bottom") => TiledObjectAlignment::Bottom,
        Some("bottomright") => TiledObjectAlignment::BottomRight,
        _ => TiledObjectAlignment::Unspecified,
    };
}

fn as_stagger_axis(value: Option<&str>) -> Option<TiledStaggerAxis> {
    return match value {
        Some("x") => Some(TiledStaggerAxis::X),
        Some("y") => Some(TiledStaggerAxis::Y),
        _ => None,
    };
}

fn as_stagger_index(value: Option<&str>) -> Option<TiledStaggerIndex> {
    return match value {
        Some("even") => Some(TiledStaggerIndex::Even),
        Some("odd") => Some(TiledStaggerIndex::Odd),
        _ => None,
    };
}

fn bool_field(obj: &JsonObject, key: &str, fallback: bool) -> bool {
    return obj
        .get(key)
        .and_then(|v| v.as_bool())
        .unwrap_or(fallback);
}

fn build_tiled_layer_base_from_json(obj: &JsonObject) -> TiledLayerBase {
    let tint = str_field(obj, "tintcolor");
    return TiledLayerBase {
        class: str_field(obj, "class").unwrap_or_default(),
        id: num_field(obj, "id", 0.0) as i32,
        name: str_field(obj, "name").unwrap_or_default(),
        offset_x: num_field(obj, "offsetx", 0.0),
        offset_y: num_field(obj, "offsety", 0.0),
        opacity: num_field(obj, "opacity", 1.0),
        parallax_x: num_field(obj, "parallaxx", 1.0),
        parallax_y: num_field(obj, "parallaxy", 1.0),
        properties: build_tiled_properties_from_json(obj),
        tint_color: tint.and_then(|t| parse_tiled_color(&t)),
        visible: bool_field(obj, "visible", true),
    };
}

fn build_tiled_layer_data_from_json(
    obj: &JsonObject,
    width: i32,
    height: i32,
    options: Option<&TiledParseOptions>,
    diagnostics: &mut Vec<ImportDiagnostic>,
    use_diag: bool,
    path: &str,
) -> Vec<u32> {
    let grid_size = (width * height) as usize;
    let mut grid = vec![0u32; grid_size];
    let data = obj.get("data");
    let mut decoded: Option<Vec<u32>> = None;

    if let Some(data) = data {
        if let Some(arr) = data.as_array() {
            decoded = Some(
                arr.iter()
                    .map(|v| {
                        if let Some(n) = v.as_f64() {
                            return n as u32;
                        }
                        return 0;
                    })
                    .collect(),
            );
        } else if let Some(text) = data.as_str() {
            let encoding = str_field(obj, "encoding");
            if encoding.as_deref() == Some("csv") {
                decoded = Some(decode_tiled_csv_layer(text));
            } else {
                if encoding.is_none() {
                    report_missing_required_field(diagnostics, "buildTiledLayerDataFromJson", path, Some("encoding"));
                } else if encoding.as_deref() != Some("base64") {
                    report_import_diagnostic(
                        Some(diagnostics),
                        ImportDiagnosticSeverity::Recover,
                        "tiled.layer-encoding-invalid",
                        "buildTiledLayerDataFromJson",
                        detail_map(&[
                            ("encoding", ImportDiagnosticDetailValue::String(encoding.unwrap_or_default())),
                            ("path", ImportDiagnosticDetailValue::String(format!("{}.encoding", path))),
                        ]),
                    );
                }
                let compression = as_compression(str_field(obj, "compression").as_deref());
                if compression.is_some() && options.and_then(|o| o.inflate.as_ref()).is_none() {
                    if use_diag {
                        report_import_diagnostic(
                            Some(diagnostics),
                            ImportDiagnosticSeverity::Recover,
                            "tiled.layer-inflate-unavailable",
                            "buildTiledLayerDataFromJson",
                            detail_map(&[
                                (
                                    "compression",
                                    ImportDiagnosticDetailValue::String(
                                        compression.unwrap().as_str().to_string(),
                                    ),
                                ),
                                ("path", ImportDiagnosticDetailValue::String(path.to_string())),
                            ]),
                        );
                    }
                }
                decoded = decode_tiled_base64_layer(
                    text,
                    compression,
                    options.and_then(|o| o.inflate.as_ref()),
                );
            }
        } else {
            // data field present but not array or string — skip
        }
    } else if use_diag {
        report_missing_required_field(diagnostics, "buildTiledLayerDataFromJson", path, None);
    }

    if let Some(decoded) = decoded {
        let copy_len = decoded.len().min(grid_size);
        grid[..copy_len].copy_from_slice(&decoded[..copy_len]);
    }
    return grid;
}

fn build_tiled_layer_from_json(
    obj: &JsonObject,
    options: Option<&TiledParseOptions>,
    diagnostics: &mut Vec<ImportDiagnostic>,
    use_diag: bool,
    path: &str,
) -> Option<TiledLayer> {
    let base = build_tiled_layer_base_from_json(obj);
    let layer_type = str_field(obj, "type");

    if layer_type.as_deref() == Some("tilelayer") {
        if use_diag {
            report_missing_json_field(obj, "height", diagnostics, "buildTiledLayerFromJson", path);
            report_missing_json_field(obj, "width", diagnostics, "buildTiledLayerFromJson", path);
        }
        let width = num_field(obj, "width", 0.0) as i32;
        let height = num_field(obj, "height", 0.0) as i32;
        let data_path = if use_diag {
            format!("{}.data", path)
        } else {
            String::new()
        };
        let data = build_tiled_layer_data_from_json(obj, width, height, options, diagnostics, use_diag, &data_path);
        return Some(TiledLayer::TileLayer {
            base,
            data,
            height,
            width,
        });
    }
    if layer_type.as_deref() == Some("objectgroup") {
        let objects = array_field(obj, "objects")
            .iter()
            .map(build_tiled_object_from_json)
            .collect();
        return Some(TiledLayer::ObjectGroup { base, objects });
    }
    if layer_type.as_deref() == Some("imagelayer") {
        return Some(TiledLayer::ImageLayer {
            base,
            image: str_field(obj, "image").unwrap_or_default(),
            repeat_x: bool_field(obj, "repeatx", false),
            repeat_y: bool_field(obj, "repeaty", false),
        });
    }
    if layer_type.as_deref() == Some("group") {
        let sub_layers_arr = array_field(obj, "layers");
        let mut sub_layers = Vec::new();
        for (index, sub_obj) in sub_layers_arr.iter().enumerate() {
            let sub_path = if use_diag {
                format!("{}.layers[{}]", path, index)
            } else {
                String::new()
            };
            let sub = build_tiled_layer_from_json(sub_obj, options, diagnostics, use_diag, &sub_path);
            if let Some(sub) = sub {
                sub_layers.push(sub);
            }
        }
        return Some(TiledLayer::Group {
            base,
            layers: sub_layers,
        });
    }
    if layer_type.is_none() && use_diag {
        report_import_diagnostic(
            Some(diagnostics),
            ImportDiagnosticSeverity::Drop,
            "tiled.required-field-missing",
            "buildTiledLayerFromJson",
            detail_map(&[("path", ImportDiagnosticDetailValue::String(format!("{}.type", path)))]),
        );
    }
    return None;
}

fn build_tiled_object_from_json(obj: &JsonObject) -> TiledObject {
    let gid = obj.get("gid").and_then(|v| v.as_f64());
    return TiledObject {
        ellipse: bool_field(obj, "ellipse", false),
        gid: gid.map(|g| g as u32),
        height: num_field(obj, "height", 0.0),
        id: num_field(obj, "id", 0.0) as i32,
        name: str_field(obj, "name").unwrap_or_default(),
        point: bool_field(obj, "point", false),
        polygon: parse_points_field(obj, "polygon"),
        polyline: parse_points_field(obj, "polyline"),
        properties: build_tiled_properties_from_json(obj),
        rotation: num_field(obj, "rotation", 0.0),
        object_type: str_field(obj, "type")
            .or_else(|| str_field(obj, "class"))
            .unwrap_or_default(),
        visible: bool_field(obj, "visible", true),
        width: num_field(obj, "width", 0.0),
        x: num_field(obj, "x", 0.0),
        y: num_field(obj, "y", 0.0),
    };
}

fn build_tiled_properties_from_json(obj: &JsonObject) -> Vec<TiledProperty> {
    return array_field(obj, "properties")
        .iter()
        .map(|property| {
            let prop_type = as_property_type(str_field(property, "type").as_deref());
            let raw = property.get("value");
            return TiledProperty {
                name: str_field(property, "name").unwrap_or_default(),
                value: coerce_property_value(&prop_type, raw),
                property_type: prop_type,
            };
        })
        .collect();
}

fn build_tiled_tileset_from_json(
    obj: &JsonObject,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    path: &str,
) -> TiledTileset {
    if let Some(diagnostics) = diagnostics {
        report_missing_json_field(obj, "name", diagnostics, "buildTiledTilesetFromJson", path);
        report_missing_json_field(obj, "tileheight", diagnostics, "buildTiledTilesetFromJson", path);
        report_missing_json_field(obj, "tilewidth", diagnostics, "buildTiledTilesetFromJson", path);
    }
    let tile_offset = object_field(obj, "tileoffset");
    return TiledTileset {
        columns: num_field(obj, "columns", 0.0) as i32,
        image: str_field(obj, "image"),
        image_height: num_field(obj, "imageheight", 0.0) as i32,
        image_width: num_field(obj, "imagewidth", 0.0) as i32,
        margin: num_field(obj, "margin", 0.0) as i32,
        name: str_field(obj, "name").unwrap_or_default(),
        object_alignment: as_object_alignment(str_field(obj, "objectalignment").as_deref()),
        properties: build_tiled_properties_from_json(obj),
        spacing: num_field(obj, "spacing", 0.0) as i32,
        tile_offset_x: tile_offset
            .as_ref()
            .map(|o| num_field(o, "x", 0.0) as i32)
            .unwrap_or(0),
        tile_offset_y: tile_offset
            .as_ref()
            .map(|o| num_field(o, "y", 0.0) as i32)
            .unwrap_or(0),
        tile_count: num_field(obj, "tilecount", 0.0) as i32,
        tile_height: num_field(obj, "tileheight", 0.0) as i32,
        tile_width: num_field(obj, "tilewidth", 0.0) as i32,
        tiles: array_field(obj, "tiles")
            .iter()
            .map(build_tiled_tileset_tile_from_json)
            .collect(),
    };
}

fn build_tiled_tileset_ref_from_json(
    obj: &JsonObject,
    diagnostics: &mut Vec<ImportDiagnostic>,
    use_diag: bool,
    path: &str,
) -> TiledTilesetRef {
    let source = str_field(obj, "source");
    return TiledTilesetRef {
        first_gid: num_field(obj, "firstgid", 1.0) as i32,
        tileset: if source.is_some() {
            None
        } else if use_diag {
            Some(build_tiled_tileset_from_json(obj, Some(diagnostics), path))
        } else {
            Some(build_tiled_tileset_from_json(obj, None, path))
        },
        source,
    };
}

fn build_tiled_tileset_tile_from_json(obj: &JsonObject) -> TiledTilesetTile {
    let animation = obj.get("animation").and_then(|v| v.as_array());
    let object_group = object_field(obj, "objectgroup");
    let frames: Option<Vec<TiledTilesetTileFrame>> = animation.map(|arr| {
        arr.iter()
            .filter_map(|v| v.as_object())
            .map(|frame| TiledTilesetTileFrame {
                duration: num_field(frame, "duration", 0.0) as i32,
                tile_id: num_field(frame, "tileid", 0.0) as i32,
            })
            .collect()
    });
    return TiledTilesetTile {
        animation: frames,
        id: num_field(obj, "id", 0.0) as i32,
        image: str_field(obj, "image"),
        objects: object_group.map(|og| {
            array_field(&og, "objects")
                .iter()
                .map(build_tiled_object_from_json)
                .collect()
        }),
        properties: build_tiled_properties_from_json(obj),
        tile_type: str_field(obj, "type")
            .or_else(|| str_field(obj, "class"))
            .unwrap_or_default(),
    };
}

fn coerce_property_value(
    prop_type: &TiledPropertyType,
    raw: Option<&serde_json::Value>,
) -> TiledPropertyValue {
    return match prop_type {
        TiledPropertyType::Bool => TiledPropertyValue::Bool(
            raw.and_then(|v| v.as_bool()).unwrap_or(false),
        ),
        TiledPropertyType::Int | TiledPropertyType::Float => TiledPropertyValue::Number(
            raw.and_then(|v| v.as_f64()).unwrap_or(0.0),
        ),
        _ => TiledPropertyValue::String(
            raw.and_then(|v| v.as_str().map(|s| s.to_string()))
                .unwrap_or_else(|| {
                    raw.map(|v| match v {
                        serde_json::Value::Null => String::new(),
                        _ => v.to_string(),
                    })
                    .unwrap_or_default()
                }),
        ),
    };
}

fn num_field(obj: &JsonObject, key: &str, fallback: f64) -> f64 {
    let value = obj.get(key).and_then(|v| v.as_f64());
    return match value {
        Some(n) if n.is_finite() => n,
        _ => fallback,
    };
}

fn num_or_string(value: Option<&serde_json::Value>) -> Option<String> {
    let Some(v) = value else {
        return None;
    };
    if let Some(n) = v.as_f64() {
        return Some(n.to_string());
    }
    if let Some(s) = v.as_str() {
        return Some(s.to_string());
    }
    return None;
}

fn object_field(obj: &JsonObject, key: &str) -> Option<JsonObject> {
    return obj.get(key).and_then(|v| v.as_object().cloned());
}

fn parse_json(text: &str) -> Option<JsonObject> {
    let root: serde_json::Value = serde_json::from_str(text).ok()?;
    return root.as_object().cloned();
}

fn parse_points_field(
    obj: &JsonObject,
    key: &str,
) -> Option<Vec<flight_geometry::Vector2>> {
    let value = obj.get(key)?;
    let arr = value.as_array()?;
    return Some(
        arr.iter()
            .filter_map(|v| v.as_object())
            .map(|point| flight_geometry::create_vector2(
                num_field(point, "x", 0.0) as f32,
                num_field(point, "y", 0.0) as f32,
            ))
            .collect(),
    );
}

fn report_missing_json_field(
    obj: &JsonObject,
    key: &str,
    diagnostics: &mut Vec<ImportDiagnostic>,
    origin: &str,
    path: &str,
) {
    if obj.contains_key(key) {
        return;
    }
    report_missing_required_field(diagnostics, origin, path, Some(key));
}

fn report_missing_required_field(
    diagnostics: &mut Vec<ImportDiagnostic>,
    origin: &str,
    path: &str,
    field: Option<&str>,
) {
    let full_path = match field {
        Some(f) => format!("{}.{}", path, f),
        None => path.to_string(),
    };
    report_import_diagnostic(
        Some(diagnostics),
        ImportDiagnosticSeverity::Recover,
        "tiled.required-field-missing",
        origin,
        detail_map(&[("path", ImportDiagnosticDetailValue::String(full_path))]),
    );
}

fn str_field(obj: &JsonObject, key: &str) -> Option<String> {
    return obj.get(key).and_then(|v| v.as_str()).map(|s| s.to_string());
}

fn string_or(value: Option<String>, fallback: &str) -> String {
    return value.unwrap_or_else(|| fallback.to_string());
}
