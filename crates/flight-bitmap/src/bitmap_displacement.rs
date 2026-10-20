use crate::types::*;

/// Warps source by sampling from displaced positions.
pub fn displace_bitmap(
    out: &mut Vec<u8>,
    source: &BitmapRegion,
    options: &BitmapDisplacementMapOptions,
) {
    let w = source.width;
    let h = source.height;
    let map = &options.map;
    let comp_x = options.component_x.unwrap_or(0) as usize;
    let comp_y = options.component_y.unwrap_or(1) as usize;
    let scale_x = options.scale_x.unwrap_or(0.0) as f64;
    let scale_y = options.scale_y.unwrap_or(0.0) as f64;
    let edge_mode = options.edge_mode;
    let mode = options.mode.unwrap_or(DisplacementMode::Wrap);
    let fill_color = options.fill_color.unwrap_or(0);
    let fill_r = ((fill_color >> 24) & 0xff) as u8;
    let fill_g = ((fill_color >> 16) & 0xff) as u8;
    let fill_b = ((fill_color >> 8) & 0xff) as u8;
    let fill_a = (fill_color & 0xff) as u8;
    let s_data = source.bitmap.data.clone();
    let s_stride = source.bitmap.width as i32;

    for py in 0..h {
        for px in 0..w {
            let di = (py as usize * w as usize + px as usize) * 4;
            let map_vx = sample_map_channel(map, px, py, comp_x);
            let map_vy = sample_map_channel(map, px, py, comp_y);
            let raw_sx = px as f64 + (map_vx as f64 / 255.0 - 0.5) * scale_x;
            let raw_sy = py as f64 + (map_vy as f64 / 255.0 - 0.5) * scale_y;

            let (mut sample_x, mut sample_y) = (raw_sx, raw_sy);

            if edge_mode.is_none() && (raw_sx < 0.0 || raw_sx >= w as f64 || raw_sy < 0.0 || raw_sy >= h as f64) {
                match mode {
                    DisplacementMode::Wrap => {
                        sample_x = ((raw_sx % w as f64) + w as f64) % w as f64;
                        sample_y = ((raw_sy % h as f64) + h as f64) % h as f64;
                    }
                    DisplacementMode::Clamp => {
                        sample_x = raw_sx.max(0.0).min(w as f64 - 1.0);
                        sample_y = raw_sy.max(0.0).min(h as f64 - 1.0);
                    }
                    DisplacementMode::Ignore => {
                        sample_x = px as f64;
                        sample_y = py as f64;
                    }
                    DisplacementMode::Color => {
                        out[di] = fill_r;
                        out[di + 1] = fill_g;
                        out[di + 2] = fill_b;
                        out[di + 3] = fill_a;
                        continue;
                    }
                }
            }

            let x0 = sample_x.floor() as i32;
            let y0 = sample_y.floor() as i32;
            let tx = sample_x - x0 as f64;
            let ty = sample_y - y0 as f64;

            let (rx0, rx1, ry0, ry1);
            if edge_mode.is_none() {
                rx0 = Some(x0.max(0).min(w - 1));
                rx1 = Some((x0 + 1).max(0).min(w - 1));
                ry0 = Some(y0.max(0).min(h - 1));
                ry1 = Some((y0 + 1).max(0).min(h - 1));
            } else {
                let em = edge_mode.unwrap();
                rx0 = resolve_displacement_edge(x0, w, em);
                rx1 = resolve_displacement_edge(x0 + 1, w, em);
                ry0 = resolve_displacement_edge(y0, h, em);
                ry1 = resolve_displacement_edge(y0 + 1, h, em);
            }

            let idx = |rx: Option<i32>, ry: Option<i32>| -> Option<usize> {
                match (rx, ry) {
                    (Some(rx), Some(ry)) => Some(((source.y + ry) as usize * s_stride as usize + (source.x + rx) as usize) * 4),
                    _ => None,
                }
            };
            let i00 = idx(rx0, ry0);
            let i10 = idx(rx1, ry0);
            let i01 = idx(rx0, ry1);
            let i11 = idx(rx1, ry1);

            for c in 0..4usize {
                let v00 = i00.map(|i| s_data[i + c] as f64).unwrap_or(0.0);
                let v10 = i10.map(|i| s_data[i + c] as f64).unwrap_or(0.0);
                let v01 = i01.map(|i| s_data[i + c] as f64).unwrap_or(0.0);
                let v11 = i11.map(|i| s_data[i + c] as f64).unwrap_or(0.0);
                let top = v00 * (1.0 - tx) + v10 * tx;
                let bottom = v01 * (1.0 - tx) + v11 * tx;
                out[di + c] = (top * (1.0 - ty) + bottom * ty).round() as u8;
            }
        }
    }
}

fn resolve_displacement_edge(v: i32, size: i32, mode: BitmapEdgeMode) -> Option<i32> {
    if v >= 0 && v < size { return Some(v); }
    match mode {
        BitmapEdgeMode::Clamp => Some(v.max(0).min(size - 1)),
        BitmapEdgeMode::Wrap => Some(((v % size) + size) % size),
        BitmapEdgeMode::Mirror => {
            let period = 2 * size;
            let wrapped = ((v % period) + period) % period;
            if wrapped < size { Some(wrapped) } else { Some(period - 1 - wrapped) }
        }
        BitmapEdgeMode::Transparent => None,
    }
}

fn sample_map_channel(map: &BitmapRegion, px: i32, py: i32, component: usize) -> u8 {
    let mx = map.x + px;
    let my = map.y + py;
    if mx < 0 || mx >= map.bitmap.width as i32 || my < 0 || my >= map.bitmap.height as i32 {
        return 128;
    }
    map.bitmap.data[(my as usize * map.bitmap.width as usize + mx as usize) * 4 + component]
}
