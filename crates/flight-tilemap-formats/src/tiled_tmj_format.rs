//! Re-emits parsed Tiled documents as TMJ/TSJ JSON (TS `tiledTmjFormat.ts`).

use crate::tiled_color::format_tiled_color;
use crate::types::*;

pub fn format_tiled_tileset_json(tileset: &TiledTileset) -> String {
    let mut obj = json_tileset(tileset);
    obj.insert("type".to_string(), serde_json::Value::String("tileset".to_string()));
    return serde_json::to_string_pretty(&obj).unwrap();
}

pub fn format_tiled_tmj(map: &TiledMap) -> String {
    let mut out = serde_json::Map::new();
    out.insert("compressionlevel".to_string(), serde_json::json!(-1));
    out.insert("height".to_string(), serde_json::json!(map.height));
    out.insert("infinite".to_string(), serde_json::json!(map.infinite));
    out.insert(
        "layers".to_string(),
        serde_json::json!(map.layers.iter().map(json_layer).collect::<Vec<_>>()),
    );
    out.insert("nextlayerid".to_string(), serde_json::json!(next_layer_id(&map.layers)));
    out.insert("nextobjectid".to_string(), serde_json::json!(next_object_id(&map.layers)));
    out.insert("orientation".to_string(), serde_json::json!(map.orientation.as_str()));
    out.insert("renderorder".to_string(), serde_json::json!(map.render_order.as_str()));
    if let Some(ref tv) = map.tiled_version {
        out.insert("tiledversion".to_string(), serde_json::json!(tv));
    }
    out.insert("tileheight".to_string(), serde_json::json!(map.tile_height));
    out.insert(
        "tilesets".to_string(),
        serde_json::json!(map.tilesets.iter().map(json_tileset_ref).collect::<Vec<_>>()),
    );
    out.insert("tilewidth".to_string(), serde_json::json!(map.tile_width));
    out.insert("type".to_string(), serde_json::json!("map"));
    out.insert("version".to_string(), serde_json::json!(map.version));
    out.insert("width".to_string(), serde_json::json!(map.width));
    if let Some(bg) = map.background_color {
        out.insert("backgroundcolor".to_string(), serde_json::json!(format_tiled_color(bg)));
    }
    if let Some(ref sa) = map.stagger_axis {
        out.insert("staggeraxis".to_string(), serde_json::json!(sa.as_str()));
    }
    if let Some(ref si) = map.stagger_index {
        out.insert("staggerindex".to_string(), serde_json::json!(si.as_str()));
    }
    if let Some(hex) = map.hex_side_length {
        out.insert("hexsidelength".to_string(), serde_json::json!(hex));
    }
    if !map.properties.is_empty() {
        out.insert(
            "properties".to_string(),
            serde_json::json!(map.properties.iter().map(json_property).collect::<Vec<_>>()),
        );
    }
    return serde_json::to_string_pretty(&serde_json::Value::Object(out)).unwrap();
}

fn json_layer(layer: &TiledLayer) -> serde_json::Map<String, serde_json::Value> {
    let base = layer.base();
    let mut out = serde_json::Map::new();
    out.insert("id".to_string(), serde_json::json!(base.id));
    out.insert("name".to_string(), serde_json::json!(base.name));
    out.insert("opacity".to_string(), serde_json::json!(base.opacity));
    out.insert("type".to_string(), serde_json::json!(layer.layer_type()));
    out.insert("visible".to_string(), serde_json::json!(base.visible));
    out.insert("x".to_string(), serde_json::json!(0));
    out.insert("y".to_string(), serde_json::json!(0));
    if base.offset_x != 0.0 {
        out.insert("offsetx".to_string(), serde_json::json!(base.offset_x));
    }
    if base.offset_y != 0.0 {
        out.insert("offsety".to_string(), serde_json::json!(base.offset_y));
    }
    if let Some(tint) = base.tint_color {
        out.insert("tintcolor".to_string(), serde_json::json!(format_tiled_color(tint)));
    }
    if base.parallax_x != 1.0 {
        out.insert("parallaxx".to_string(), serde_json::json!(base.parallax_x));
    }
    if base.parallax_y != 1.0 {
        out.insert("parallaxy".to_string(), serde_json::json!(base.parallax_y));
    }
    if !base.class.is_empty() {
        out.insert("class".to_string(), serde_json::json!(base.class));
    }
    if !base.properties.is_empty() {
        out.insert(
            "properties".to_string(),
            serde_json::json!(base.properties.iter().map(json_property).collect::<Vec<_>>()),
        );
    }

    match layer {
        TiledLayer::TileLayer(d) => {
            out.insert("data".to_string(), serde_json::json!(d.data));
            out.insert("height".to_string(), serde_json::json!(d.height));
            out.insert("width".to_string(), serde_json::json!(d.width));
        }
        TiledLayer::ObjectGroup(d) => {
            out.insert(
                "objects".to_string(),
                serde_json::json!(d.objects.iter().map(json_object).collect::<Vec<_>>()),
            );
        }
        TiledLayer::ImageLayer(d) => {
            out.insert("image".to_string(), serde_json::json!(d.image));
            if d.repeat_x {
                out.insert("repeatx".to_string(), serde_json::json!(true));
            }
            if d.repeat_y {
                out.insert("repeaty".to_string(), serde_json::json!(true));
            }
        }
        TiledLayer::Group(d) => {
            out.insert(
                "layers".to_string(),
                serde_json::json!(d.layers.iter().map(json_layer).collect::<Vec<_>>()),
            );
        }
    }
    return out;
}

fn json_object(object: &TiledObject) -> serde_json::Map<String, serde_json::Value> {
    let mut out = serde_json::Map::new();
    out.insert("height".to_string(), serde_json::json!(object.height));
    out.insert("id".to_string(), serde_json::json!(object.id));
    out.insert("name".to_string(), serde_json::json!(object.name));
    out.insert("rotation".to_string(), serde_json::json!(object.rotation));
    out.insert("type".to_string(), serde_json::json!(object.object_type));
    out.insert("visible".to_string(), serde_json::json!(object.visible));
    out.insert("width".to_string(), serde_json::json!(object.width));
    out.insert("x".to_string(), serde_json::json!(object.x));
    out.insert("y".to_string(), serde_json::json!(object.y));
    if let Some(gid) = object.gid {
        out.insert("gid".to_string(), serde_json::json!(gid));
    }
    if object.point {
        out.insert("point".to_string(), serde_json::json!(true));
    }
    if object.ellipse {
        out.insert("ellipse".to_string(), serde_json::json!(true));
    }
    if let Some(ref polygon) = object.polygon {
        let pts: Vec<serde_json::Value> = polygon
            .iter()
            .map(|p| serde_json::json!({"x": p.x, "y": p.y}))
            .collect();
        out.insert("polygon".to_string(), serde_json::json!(pts));
    }
    if let Some(ref polyline) = object.polyline {
        let pts: Vec<serde_json::Value> = polyline
            .iter()
            .map(|p| serde_json::json!({"x": p.x, "y": p.y}))
            .collect();
        out.insert("polyline".to_string(), serde_json::json!(pts));
    }
    if !object.properties.is_empty() {
        out.insert(
            "properties".to_string(),
            serde_json::json!(object.properties.iter().map(json_property).collect::<Vec<_>>()),
        );
    }
    return out;
}

fn json_property(property: &TiledProperty) -> serde_json::Map<String, serde_json::Value> {
    let mut out = serde_json::Map::new();
    out.insert("name".to_string(), serde_json::json!(property.name));
    out.insert("type".to_string(), serde_json::json!(property.property_type.as_str()));
    match &property.value {
        TiledPropertyValue::String(s) => {
            out.insert("value".to_string(), serde_json::json!(s));
        }
        TiledPropertyValue::Number(n) => {
            out.insert("value".to_string(), serde_json::json!(n));
        }
        TiledPropertyValue::Bool(b) => {
            out.insert("value".to_string(), serde_json::json!(b));
        }
    }
    return out;
}

fn json_tileset(tileset: &TiledTileset) -> serde_json::Map<String, serde_json::Value> {
    let mut out = serde_json::Map::new();
    out.insert("columns".to_string(), serde_json::json!(tileset.columns));
    out.insert("margin".to_string(), serde_json::json!(tileset.margin));
    out.insert("name".to_string(), serde_json::json!(tileset.name));
    out.insert("spacing".to_string(), serde_json::json!(tileset.spacing));
    out.insert("tilecount".to_string(), serde_json::json!(tileset.tile_count));
    out.insert("tileheight".to_string(), serde_json::json!(tileset.tile_height));
    out.insert("tilewidth".to_string(), serde_json::json!(tileset.tile_width));
    if let Some(ref img) = tileset.image {
        out.insert("image".to_string(), serde_json::json!(img));
        out.insert("imageheight".to_string(), serde_json::json!(tileset.image_height));
        out.insert("imagewidth".to_string(), serde_json::json!(tileset.image_width));
    }
    if tileset.tile_offset_x != 0 || tileset.tile_offset_y != 0 {
        out.insert(
            "tileoffset".to_string(),
            serde_json::json!({"x": tileset.tile_offset_x, "y": tileset.tile_offset_y}),
        );
    }
    if tileset.object_alignment != TiledObjectAlignment::Unspecified {
        out.insert("objectalignment".to_string(), serde_json::json!(tileset.object_alignment.as_str()));
    }
    if !tileset.tiles.is_empty() {
        out.insert(
            "tiles".to_string(),
            serde_json::json!(tileset.tiles.iter().map(json_tileset_tile).collect::<Vec<_>>()),
        );
    }
    if !tileset.properties.is_empty() {
        out.insert(
            "properties".to_string(),
            serde_json::json!(tileset.properties.iter().map(json_property).collect::<Vec<_>>()),
        );
    }
    return out;
}

fn json_tileset_ref(tileset_ref: &TiledTilesetRef) -> serde_json::Map<String, serde_json::Value> {
    if let Some(ref source) = tileset_ref.source {
        let mut out = serde_json::Map::new();
        out.insert("firstgid".to_string(), serde_json::json!(tileset_ref.first_gid));
        out.insert("source".to_string(), serde_json::json!(source));
        return out;
    }
    if let Some(ref tileset) = tileset_ref.tileset {
        let mut out = json_tileset(tileset);
        out.insert("firstgid".to_string(), serde_json::json!(tileset_ref.first_gid));
        return out;
    }
    let mut out = serde_json::Map::new();
    out.insert("firstgid".to_string(), serde_json::json!(tileset_ref.first_gid));
    return out;
}

fn json_tileset_tile(tile: &TiledTilesetTile) -> serde_json::Map<String, serde_json::Value> {
    let mut out = serde_json::Map::new();
    out.insert("id".to_string(), serde_json::json!(tile.id));
    if !tile.tile_type.is_empty() {
        out.insert("type".to_string(), serde_json::json!(tile.tile_type));
    }
    if let Some(ref img) = tile.image {
        out.insert("image".to_string(), serde_json::json!(img));
    }
    if let Some(ref animation) = tile.animation {
        let frames: Vec<serde_json::Value> = animation
            .iter()
            .map(|f| serde_json::json!({"duration": f.duration, "tileid": f.tile_id}))
            .collect();
        out.insert("animation".to_string(), serde_json::json!(frames));
    }
    if let Some(ref objects) = tile.objects {
        let mut og = serde_json::Map::new();
        og.insert("draworder".to_string(), serde_json::json!("index"));
        og.insert(
            "objects".to_string(),
            serde_json::json!(objects.iter().map(json_object).collect::<Vec<_>>()),
        );
        og.insert("type".to_string(), serde_json::json!("objectgroup"));
        out.insert("objectgroup".to_string(), serde_json::Value::Object(og));
    }
    if !tile.properties.is_empty() {
        out.insert(
            "properties".to_string(),
            serde_json::json!(tile.properties.iter().map(json_property).collect::<Vec<_>>()),
        );
    }
    return out;
}

fn next_layer_id(layers: &[TiledLayer]) -> i32 {
    let mut max = 0;
    for layer in layers {
        let id = layer.base().id;
        if id > max {
            max = id;
        }
        if let TiledLayer::Group(d) = layer {
            max = max.max(next_layer_id(&d.layers) - 1);
        }
    }
    return max + 1;
}

fn next_object_id(layers: &[TiledLayer]) -> i32 {
    let mut max = 0;
    for layer in layers {
        if let TiledLayer::ObjectGroup(d) = layer {
            for object in &d.objects {
                if object.id > max {
                    max = object.id;
                }
            }
        }
        if let TiledLayer::Group(d) = layer {
            max = max.max(next_object_id(&d.layers) - 1);
        }
    }
    return max + 1;
}
