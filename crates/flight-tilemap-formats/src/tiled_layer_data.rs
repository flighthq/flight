//! Base64 and CSV tile layer data decoding, guard seam, and explanation
//! (TS `tiledLayerData.ts`).

use std::sync::Arc;
use std::sync::Mutex;

use crate::types::{TiledCompression, TiledInflate, TiledLayerDataExplanation, TiledLayerDataFailure};

pub type TiledLayerDataGuard =
    Arc<dyn Fn(TiledLayerDataFailure, TiledCompression) + Send + Sync>;

// flight-lint: allow(hidden-state) module-level guard mirrors the TS source's _guard variable; caller sets it via set_tiled_layer_data_guard
static GUARD: Mutex<Option<TiledLayerDataGuard>> = Mutex::new(None);

const BASE64_TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_index(c: u8) -> i32 {
    return match BASE64_TABLE.iter().position(|&b| b == c) {
        Some(i) => i as i32,
        None => -1,
    };
}

fn decode_base64(s: &str) -> Vec<u8> {
    let stripped: Vec<u8> = s
        .bytes()
        .filter(|b| b.is_ascii_alphanumeric() || *b == b'+' || *b == b'/')
        .collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < stripped.len() {
        let c0 = base64_index(stripped[i]);
        let c1 = if i + 1 < stripped.len() {
            base64_index(stripped[i + 1])
        } else {
            -1
        };
        let c2 = if i + 2 < stripped.len() {
            base64_index(stripped[i + 2])
        } else {
            -1
        };
        let c3 = if i + 3 < stripped.len() {
            base64_index(stripped[i + 3])
        } else {
            -1
        };
        let n = (c0 << 18)
            | (c1 << 12)
            | (if c2 < 0 { 0 } else { c2 } << 6)
            | if c3 < 0 { 0 } else { c3 };
        out.push(((n >> 16) & 0xff) as u8);
        if c2 >= 0 {
            out.push(((n >> 8) & 0xff) as u8);
        }
        if c3 >= 0 {
            out.push((n & 0xff) as u8);
        }
        i += 4;
    }
    return out;
}

// flight-lint: allow(conform-array) Vec<u32> is the Rust canonical carrier for TS Uint32Array
pub fn decode_tiled_base64_layer(
    text: &str,
    compression: Option<TiledCompression>,
    inflate: Option<&TiledInflate>,
) -> Option<Vec<u32>> {
    let mut bytes = decode_base64(text);
    if let Some(compression) = compression {
        let Some(inflate) = inflate else {
            fire_guard(TiledLayerDataFailure::CompressedWithoutInflate, compression);
            return None;
        };
        let inflated = inflate(&bytes, compression);
        let Some(inflated) = inflated else {
            fire_guard(TiledLayerDataFailure::InflateFailed, compression);
            return None;
        };
        bytes = inflated;
    }
    let count = bytes.len() / 4;
    let mut gids = Vec::with_capacity(count);
    for i in 0..count {
        let b = i * 4;
        let gid = (bytes[b] as u32)
            | ((bytes[b + 1] as u32) << 8)
            | ((bytes[b + 2] as u32) << 16)
            | ((bytes[b + 3] as u32) << 24);
        gids.push(gid);
    }
    return Some(gids);
}

// flight-lint: allow(conform-array) Vec<u32> is the Rust canonical carrier for TS Uint32Array
// flight-lint: allow(f64) CSV layer values parsed as f64 to handle both integer and float representations per the Tiled spec
pub fn decode_tiled_csv_layer(text: &str) -> Vec<u32> {
    let mut out = Vec::new();
    for part in text.split(',') {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        let n: f64 = trimmed.parse().unwrap_or(f64::NAN);
        if n.is_finite() {
            out.push(n as u32);
        } else {
            out.push(0);
        }
    }
    return out;
}

pub fn explain_tiled_layer_data(
    text: &str,
    compression: Option<TiledCompression>,
    inflate: Option<&TiledInflate>,
) -> TiledLayerDataExplanation {
    if compression.is_none() {
        return TiledLayerDataExplanation {
            preserved_as_zero_grid: false,
            reason: "decoded".to_string(),
        };
    }
    let compression = compression.unwrap();
    let Some(inflate) = inflate else {
        return TiledLayerDataExplanation {
            preserved_as_zero_grid: true,
            reason: "compressed-without-inflate".to_string(),
        };
    };
    let bytes = decode_base64(text);
    let inflated = inflate(&bytes, compression);
    if inflated.is_none() {
        return TiledLayerDataExplanation {
            preserved_as_zero_grid: true,
            reason: "inflate-failed".to_string(),
        };
    }
    return TiledLayerDataExplanation {
        preserved_as_zero_grid: false,
        reason: "decoded".to_string(),
    };
}

fn fire_guard(reason: TiledLayerDataFailure, compression: TiledCompression) {
    let g = GUARD.lock().unwrap();
    if let Some(guard) = g.as_ref() {
        guard(reason, compression);
    }
}

pub fn set_tiled_layer_data_guard(guard: Option<TiledLayerDataGuard>) {
    let mut g = GUARD.lock().unwrap();
    *g = guard;
}
