//! JSON round-tripping for `BitmapFilter` (e.g. scene serialization).
//!
//! `BitmapFilter` variant structs do not derive `serde::Serialize`/`Deserialize` — they are the
//! authoritative Rust types, and this module owns the seam that maps them onto the loosely-typed
//! `serde_json::Value` wire format (camelCase keys, matching the TS `BitmapFilter` field names).
//! Fields that are `None` are omitted from the serialized object, mirroring the TS convention
//! where an unset optional property is simply absent.

use serde_json::{Map, Value, json};

use flighthq_types::{
    BevelFilter, BevelType, BitmapFilter, BlurFilter, ColorMatrixFilter, ConvolutionFilter,
    DisplacementMapFilter, DisplacementMapMode, DropShadowFilter, GradientBevelFilter,
    GradientGlowFilter, InnerGlowFilter, InnerShadowFilter, MedianFilter, OuterGlowFilter,
    PixelateFilterDescriptor, SharpenFilterDescriptor,
};

/// Returns the canonical list of all built-in `BitmapFilter` kind strings. Useful for tooling and
/// inspectors that need to enumerate the known filter types.
pub fn enumerate_bitmap_filter_kinds() -> &'static [&'static str] {
    KNOWN_BITMAP_FILTER_KINDS
}

/// Reconstructs a `BitmapFilter` from a plain JSON value (e.g. parsed scene JSON). Returns `None`
/// when `data` is not an object, or its `kind` field is missing or not a recognised kind string.
/// Sentinel return; never panics.
pub fn from_bitmap_filter_data(data: &Value) -> Option<BitmapFilter> {
    let obj = data.as_object()?;
    let kind = obj.get("kind")?.as_str()?;
    match kind {
        "BevelFilter" => Some(BitmapFilter::Bevel(BevelFilter {
            angle: get_f32(obj, "angle"),
            bevel_type: get_str(obj, "bevelType").and_then(parse_bevel_type),
            blur_x: get_f32(obj, "blurX"),
            blur_y: get_f32(obj, "blurY"),
            distance: get_f32(obj, "distance"),
            highlight_alpha: get_f32(obj, "highlightAlpha"),
            highlight_color: get_u32(obj, "highlightColor"),
            knockout: get_bool(obj, "knockout"),
            quality: get_u32(obj, "quality"),
            shadow_alpha: get_f32(obj, "shadowAlpha"),
            shadow_color: get_u32(obj, "shadowColor"),
            strength: get_f32(obj, "strength"),
        })),
        "BlurFilter" => Some(BitmapFilter::Blur(BlurFilter {
            blur_x: get_f32(obj, "blurX"),
            blur_y: get_f32(obj, "blurY"),
        })),
        "ColorMatrixFilter" => Some(BitmapFilter::ColorMatrix(ColorMatrixFilter {
            matrix: get_vec_f32(obj, "matrix"),
        })),
        "ConvolutionFilter" => Some(BitmapFilter::Convolution(ConvolutionFilter {
            bias: get_f32(obj, "bias"),
            clamp: get_bool(obj, "clamp"),
            color: get_u32(obj, "color"),
            divisor: get_f32(obj, "divisor"),
            matrix: get_vec_f32(obj, "matrix"),
            matrix_x: get_u32(obj, "matrixX").unwrap_or(0),
            matrix_y: get_u32(obj, "matrixY").unwrap_or(0),
            preserve_alpha: get_bool(obj, "preserveAlpha"),
        })),
        "DisplacementMapFilter" => Some(BitmapFilter::DisplacementMap(DisplacementMapFilter {
            alpha: get_f32(obj, "alpha"),
            color: get_u32(obj, "color"),
            component_x: get_u32(obj, "componentX").map(|v| v as u8),
            component_y: get_u32(obj, "componentY").map(|v| v as u8),
            mode: get_str(obj, "mode").and_then(parse_displacement_mode),
            scale_x: get_f32(obj, "scaleX"),
            scale_y: get_f32(obj, "scaleY"),
        })),
        "DropShadowFilter" => Some(BitmapFilter::DropShadow(DropShadowFilter {
            alpha: get_f32(obj, "alpha"),
            angle: get_f32(obj, "angle"),
            blur_x: get_f32(obj, "blurX"),
            blur_y: get_f32(obj, "blurY"),
            color: get_u32(obj, "color"),
            distance: get_f32(obj, "distance"),
            hide_object: get_bool(obj, "hideObject"),
            knockout: get_bool(obj, "knockout"),
            quality: get_u32(obj, "quality"),
            strength: get_f32(obj, "strength"),
        })),
        "GradientBevelFilter" => Some(BitmapFilter::GradientBevel(GradientBevelFilter {
            alphas: get_vec_f32(obj, "alphas"),
            angle: get_f32(obj, "angle"),
            bevel_type: get_str(obj, "bevelType").and_then(parse_bevel_type),
            blur_x: get_f32(obj, "blurX"),
            blur_y: get_f32(obj, "blurY"),
            colors: get_vec_u32(obj, "colors"),
            distance: get_f32(obj, "distance"),
            quality: get_u32(obj, "quality"),
            ratios: get_vec_f32(obj, "ratios"),
            strength: get_f32(obj, "strength"),
        })),
        "GradientGlowFilter" => Some(BitmapFilter::GradientGlow(GradientGlowFilter {
            alphas: get_vec_f32(obj, "alphas"),
            blur_x: get_f32(obj, "blurX"),
            blur_y: get_f32(obj, "blurY"),
            colors: get_vec_u32(obj, "colors"),
            quality: get_u32(obj, "quality"),
            ratios: get_vec_f32(obj, "ratios"),
            strength: get_f32(obj, "strength"),
        })),
        "InnerGlowFilter" => Some(BitmapFilter::InnerGlow(InnerGlowFilter {
            alpha: get_f32(obj, "alpha"),
            blur_x: get_f32(obj, "blurX"),
            blur_y: get_f32(obj, "blurY"),
            color: get_u32(obj, "color"),
            quality: get_u32(obj, "quality"),
            strength: get_f32(obj, "strength"),
        })),
        "InnerShadowFilter" => Some(BitmapFilter::InnerShadow(InnerShadowFilter {
            alpha: get_f32(obj, "alpha"),
            angle: get_f32(obj, "angle"),
            blur_x: get_f32(obj, "blurX"),
            blur_y: get_f32(obj, "blurY"),
            color: get_u32(obj, "color"),
            distance: get_f32(obj, "distance"),
            quality: get_u32(obj, "quality"),
            strength: get_f32(obj, "strength"),
        })),
        "MedianFilter" => Some(BitmapFilter::Median(MedianFilter {
            radius: get_f32(obj, "radius"),
        })),
        "OuterGlowFilter" => Some(BitmapFilter::OuterGlow(OuterGlowFilter {
            alpha: get_f32(obj, "alpha"),
            blur_x: get_f32(obj, "blurX"),
            blur_y: get_f32(obj, "blurY"),
            color: get_u32(obj, "color"),
            knockout: get_bool(obj, "knockout"),
            quality: get_u32(obj, "quality"),
            strength: get_f32(obj, "strength"),
        })),
        "PixelateFilter" => Some(BitmapFilter::Pixelate(PixelateFilterDescriptor {
            block_size: get_f32(obj, "blockSize"),
        })),
        "SharpenFilter" => Some(BitmapFilter::Sharpen(SharpenFilterDescriptor {
            amount: get_f32(obj, "amount"),
            blur_x: get_f32(obj, "blurX"),
            blur_y: get_f32(obj, "blurY"),
            quality: get_u32(obj, "quality"),
        })),
        _ => None,
    }
}

/// Projects `filter` to a plain JSON value safe for serialisation. Array fields are copied, not
/// aliased. The `kind` field is always present; optional fields that are `None` are omitted.
pub fn to_bitmap_filter_data(filter: &BitmapFilter) -> Value {
    let mut map = Map::new();
    match filter {
        BitmapFilter::Bevel(f) => {
            map.insert("kind".into(), json!("BevelFilter"));
            put_f32(&mut map, "angle", f.angle);
            put_str(&mut map, "bevelType", f.bevel_type.map(bevel_type_str));
            put_f32(&mut map, "blurX", f.blur_x);
            put_f32(&mut map, "blurY", f.blur_y);
            put_f32(&mut map, "distance", f.distance);
            put_f32(&mut map, "highlightAlpha", f.highlight_alpha);
            put_u32(&mut map, "highlightColor", f.highlight_color);
            put_bool(&mut map, "knockout", f.knockout);
            put_u32(&mut map, "quality", f.quality);
            put_f32(&mut map, "shadowAlpha", f.shadow_alpha);
            put_u32(&mut map, "shadowColor", f.shadow_color);
            put_f32(&mut map, "strength", f.strength);
        }
        BitmapFilter::Blur(f) => {
            map.insert("kind".into(), json!("BlurFilter"));
            put_f32(&mut map, "blurX", f.blur_x);
            put_f32(&mut map, "blurY", f.blur_y);
        }
        BitmapFilter::ColorMatrix(f) => {
            map.insert("kind".into(), json!("ColorMatrixFilter"));
            put_vec_f32(&mut map, "matrix", &f.matrix);
        }
        BitmapFilter::Convolution(f) => {
            map.insert("kind".into(), json!("ConvolutionFilter"));
            put_f32(&mut map, "bias", f.bias);
            put_bool(&mut map, "clamp", f.clamp);
            put_u32(&mut map, "color", f.color);
            put_f32(&mut map, "divisor", f.divisor);
            put_vec_f32(&mut map, "matrix", &f.matrix);
            map.insert("matrixX".into(), json!(f.matrix_x));
            map.insert("matrixY".into(), json!(f.matrix_y));
            put_bool(&mut map, "preserveAlpha", f.preserve_alpha);
        }
        BitmapFilter::DisplacementMap(f) => {
            map.insert("kind".into(), json!("DisplacementMapFilter"));
            put_f32(&mut map, "alpha", f.alpha);
            put_u32(&mut map, "color", f.color);
            put_u32(&mut map, "componentX", f.component_x.map(|v| v as u32));
            put_u32(&mut map, "componentY", f.component_y.map(|v| v as u32));
            put_str(&mut map, "mode", f.mode.map(displacement_mode_str));
            put_f32(&mut map, "scaleX", f.scale_x);
            put_f32(&mut map, "scaleY", f.scale_y);
        }
        BitmapFilter::DropShadow(f) => {
            map.insert("kind".into(), json!("DropShadowFilter"));
            put_f32(&mut map, "alpha", f.alpha);
            put_f32(&mut map, "angle", f.angle);
            put_f32(&mut map, "blurX", f.blur_x);
            put_f32(&mut map, "blurY", f.blur_y);
            put_u32(&mut map, "color", f.color);
            put_f32(&mut map, "distance", f.distance);
            put_bool(&mut map, "hideObject", f.hide_object);
            put_bool(&mut map, "knockout", f.knockout);
            put_u32(&mut map, "quality", f.quality);
            put_f32(&mut map, "strength", f.strength);
        }
        BitmapFilter::GradientBevel(f) => {
            map.insert("kind".into(), json!("GradientBevelFilter"));
            put_vec_f32(&mut map, "alphas", &f.alphas);
            put_f32(&mut map, "angle", f.angle);
            put_str(&mut map, "bevelType", f.bevel_type.map(bevel_type_str));
            put_f32(&mut map, "blurX", f.blur_x);
            put_f32(&mut map, "blurY", f.blur_y);
            put_vec_u32(&mut map, "colors", &f.colors);
            put_f32(&mut map, "distance", f.distance);
            put_u32(&mut map, "quality", f.quality);
            put_vec_f32(&mut map, "ratios", &f.ratios);
            put_f32(&mut map, "strength", f.strength);
        }
        BitmapFilter::GradientGlow(f) => {
            map.insert("kind".into(), json!("GradientGlowFilter"));
            put_vec_f32(&mut map, "alphas", &f.alphas);
            put_f32(&mut map, "blurX", f.blur_x);
            put_f32(&mut map, "blurY", f.blur_y);
            put_vec_u32(&mut map, "colors", &f.colors);
            put_u32(&mut map, "quality", f.quality);
            put_vec_f32(&mut map, "ratios", &f.ratios);
            put_f32(&mut map, "strength", f.strength);
        }
        BitmapFilter::InnerGlow(f) => {
            map.insert("kind".into(), json!("InnerGlowFilter"));
            put_f32(&mut map, "alpha", f.alpha);
            put_f32(&mut map, "blurX", f.blur_x);
            put_f32(&mut map, "blurY", f.blur_y);
            put_u32(&mut map, "color", f.color);
            put_u32(&mut map, "quality", f.quality);
            put_f32(&mut map, "strength", f.strength);
        }
        BitmapFilter::InnerShadow(f) => {
            map.insert("kind".into(), json!("InnerShadowFilter"));
            put_f32(&mut map, "alpha", f.alpha);
            put_f32(&mut map, "angle", f.angle);
            put_f32(&mut map, "blurX", f.blur_x);
            put_f32(&mut map, "blurY", f.blur_y);
            put_u32(&mut map, "color", f.color);
            put_f32(&mut map, "distance", f.distance);
            put_u32(&mut map, "quality", f.quality);
            put_f32(&mut map, "strength", f.strength);
        }
        BitmapFilter::Median(f) => {
            map.insert("kind".into(), json!("MedianFilter"));
            put_f32(&mut map, "radius", f.radius);
        }
        BitmapFilter::OuterGlow(f) => {
            map.insert("kind".into(), json!("OuterGlowFilter"));
            put_f32(&mut map, "alpha", f.alpha);
            put_f32(&mut map, "blurX", f.blur_x);
            put_f32(&mut map, "blurY", f.blur_y);
            put_u32(&mut map, "color", f.color);
            put_bool(&mut map, "knockout", f.knockout);
            put_u32(&mut map, "quality", f.quality);
            put_f32(&mut map, "strength", f.strength);
        }
        BitmapFilter::Pixelate(f) => {
            map.insert("kind".into(), json!("PixelateFilter"));
            put_f32(&mut map, "blockSize", f.block_size);
        }
        BitmapFilter::Sharpen(f) => {
            map.insert("kind".into(), json!("SharpenFilter"));
            put_f32(&mut map, "amount", f.amount);
            put_f32(&mut map, "blurX", f.blur_x);
            put_f32(&mut map, "blurY", f.blur_y);
            put_u32(&mut map, "quality", f.quality);
        }
    }
    Value::Object(map)
}

/// The set of kind strings that `from_bitmap_filter_data` recognises.
const KNOWN_BITMAP_FILTER_KINDS: &[&str] = &[
    "BevelFilter",
    "BlurFilter",
    "ColorMatrixFilter",
    "ConvolutionFilter",
    "DisplacementMapFilter",
    "DropShadowFilter",
    "GradientBevelFilter",
    "GradientGlowFilter",
    "InnerGlowFilter",
    "InnerShadowFilter",
    "MedianFilter",
    "OuterGlowFilter",
    "PixelateFilter",
    "SharpenFilter",
];

fn bevel_type_str(t: BevelType) -> &'static str {
    match t {
        BevelType::Full => "full",
        BevelType::Inner => "inner",
        BevelType::Outer => "outer",
    }
}

fn displacement_mode_str(m: DisplacementMapMode) -> &'static str {
    match m {
        DisplacementMapMode::Clamp => "clamp",
        DisplacementMapMode::Color => "color",
        DisplacementMapMode::Ignore => "ignore",
        DisplacementMapMode::Wrap => "wrap",
    }
}

fn get_bool(obj: &Map<String, Value>, key: &str) -> Option<bool> {
    obj.get(key).and_then(Value::as_bool)
}

fn get_f32(obj: &Map<String, Value>, key: &str) -> Option<f32> {
    obj.get(key).and_then(Value::as_f64).map(|v| v as f32)
}

fn get_str<'a>(obj: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    obj.get(key).and_then(Value::as_str)
}

fn get_u32(obj: &Map<String, Value>, key: &str) -> Option<u32> {
    obj.get(key).and_then(Value::as_f64).map(|v| v as u32)
}

fn get_vec_f32(obj: &Map<String, Value>, key: &str) -> Vec<f32> {
    obj.get(key)
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_f64)
                .map(|v| v as f32)
                .collect()
        })
        .unwrap_or_default()
}

fn get_vec_u32(obj: &Map<String, Value>, key: &str) -> Vec<u32> {
    obj.get(key)
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_f64)
                .map(|v| v as u32)
                .collect()
        })
        .unwrap_or_default()
}

fn parse_bevel_type(s: &str) -> Option<BevelType> {
    match s {
        "full" => Some(BevelType::Full),
        "inner" => Some(BevelType::Inner),
        "outer" => Some(BevelType::Outer),
        _ => None,
    }
}

fn parse_displacement_mode(s: &str) -> Option<DisplacementMapMode> {
    match s {
        "clamp" => Some(DisplacementMapMode::Clamp),
        "color" => Some(DisplacementMapMode::Color),
        "ignore" => Some(DisplacementMapMode::Ignore),
        "wrap" => Some(DisplacementMapMode::Wrap),
        _ => None,
    }
}

fn put_bool(map: &mut Map<String, Value>, key: &str, value: Option<bool>) {
    if let Some(v) = value {
        map.insert(key.to_string(), json!(v));
    }
}

fn put_f32(map: &mut Map<String, Value>, key: &str, value: Option<f32>) {
    if let Some(v) = value {
        map.insert(key.to_string(), json!(v));
    }
}

fn put_str(map: &mut Map<String, Value>, key: &str, value: Option<&str>) {
    if let Some(v) = value {
        map.insert(key.to_string(), json!(v));
    }
}

fn put_u32(map: &mut Map<String, Value>, key: &str, value: Option<u32>) {
    if let Some(v) = value {
        map.insert(key.to_string(), json!(v));
    }
}

fn put_vec_f32(map: &mut Map<String, Value>, key: &str, value: &[f32]) {
    map.insert(key.to_string(), json!(value.to_vec()));
}

fn put_vec_u32(map: &mut Map<String, Value>, key: &str, value: &[u32]) {
    map.insert(key.to_string(), json!(value.to_vec()));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enumerate_bitmap_filter_kinds_includes_bevel_filter() {
        assert!(enumerate_bitmap_filter_kinds().contains(&"BevelFilter"));
    }

    #[test]
    fn enumerate_bitmap_filter_kinds_returns_fourteen_kinds() {
        assert_eq!(enumerate_bitmap_filter_kinds().len(), 14);
    }

    #[test]
    fn from_bitmap_filter_data_returns_none_for_non_object() {
        assert!(from_bitmap_filter_data(&json!("not an object")).is_none());
    }

    #[test]
    fn from_bitmap_filter_data_returns_none_for_unknown_kind() {
        assert!(from_bitmap_filter_data(&json!({ "kind": "NotAFilter" })).is_none());
    }

    #[test]
    fn from_bitmap_filter_data_reconstructs_blur_filter() {
        let data = json!({ "kind": "BlurFilter", "blurX": 8.0, "blurY": 2.0 });
        let filter = from_bitmap_filter_data(&data).unwrap();
        match filter {
            BitmapFilter::Blur(f) => {
                assert_eq!(f.blur_x, Some(8.0));
                assert_eq!(f.blur_y, Some(2.0));
            }
            _ => unreachable!(),
        }
    }

    #[test]
    fn from_bitmap_filter_data_reconstructs_color_matrix_filter_matrix() {
        let data = json!({ "kind": "ColorMatrixFilter", "matrix": [1.0, 2.0, 3.0] });
        let filter = from_bitmap_filter_data(&data).unwrap();
        match filter {
            BitmapFilter::ColorMatrix(f) => assert_eq!(f.matrix, vec![1.0, 2.0, 3.0]),
            _ => unreachable!(),
        }
    }

    #[test]
    fn to_bitmap_filter_data_omits_none_fields() {
        let filter = BitmapFilter::Blur(BlurFilter {
            blur_x: Some(4.0),
            blur_y: None,
        });
        let data = to_bitmap_filter_data(&filter);
        let obj = data.as_object().unwrap();
        assert_eq!(obj.get("blurX"), Some(&json!(4.0)));
        assert!(!obj.contains_key("blurY"));
    }

    #[test]
    fn to_bitmap_filter_data_includes_kind() {
        let filter = BitmapFilter::Median(MedianFilter { radius: Some(3.0) });
        let data = to_bitmap_filter_data(&filter);
        assert_eq!(data.get("kind"), Some(&json!("MedianFilter")));
    }

    #[test]
    fn to_bitmap_filter_data_copies_array_fields() {
        let filter = BitmapFilter::ColorMatrix(ColorMatrixFilter {
            matrix: vec![1.0; 20],
        });
        let data = to_bitmap_filter_data(&filter);
        assert_eq!(data.get("matrix").unwrap().as_array().unwrap().len(), 20);
    }

    #[test]
    fn round_trip_preserves_bevel_filter_fields() {
        let filter = BitmapFilter::Bevel(BevelFilter {
            angle: Some(90.0),
            bevel_type: Some(BevelType::Outer),
            strength: Some(2.0),
            ..Default::default()
        });
        let data = to_bitmap_filter_data(&filter);
        let round_tripped = from_bitmap_filter_data(&data).unwrap();
        match round_tripped {
            BitmapFilter::Bevel(f) => {
                assert_eq!(f.angle, Some(90.0));
                assert_eq!(f.bevel_type, Some(BevelType::Outer));
                assert_eq!(f.strength, Some(2.0));
            }
            _ => unreachable!(),
        }
    }
}
