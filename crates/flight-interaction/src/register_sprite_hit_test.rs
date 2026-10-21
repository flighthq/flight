use std::collections::HashMap;
use std::sync::{Arc, Mutex, Weak};

use flight_bitmap::{Bitmap, HostBitmapReadbackCapability, ImageChannel, get_bitmap_pixel_channel};
use flight_entity::get_entity_id;
use flight_geometry::{create_vector2, inverse_matrix_transform_point_xy};
use flight_image::{as_image_resource_ref, capture_bitmap_from_image_resource};
use flight_node::{get_node_world_matrix, NodeRef};
use flight_node::contract::NodeRevisionState;
use flight_scene2d::{SPRITE_KIND, Sprite};
use flight_texture::{Texture, TextureSource, TextureSourceRef};

use crate::hit_tests::{hit_test_graph_local_bounds, register_hit_test_precise, HitTestContext};

struct CachedBitmapEntry {
    weak_source: Weak<std::sync::RwLock<dyn TextureSource>>,
    bitmap: Bitmap,
}

struct BitmapCapture {
    bitmap: Bitmap,
    image_width: u32,
    image_height: u32,
}

fn bitmap_for_image(
    host_bitmap_readback: &HostBitmapReadbackCapability,
    image: &TextureSourceRef,
    cache: &Mutex<HashMap<u64, CachedBitmapEntry>>,
) -> Option<BitmapCapture> {
    let ts = image.read().unwrap();
    let source_fields = ts.texture_source_fields();
    let kind = source_fields.kind.clone();
    let w = source_fields.width;
    let h = source_fields.height;
    drop(ts);

    if kind == flight_bitmap::BITMAP_TEXTURE_SOURCE_KIND {
        let ts = image.read().unwrap();
        let any_ref: &dyn std::any::Any = &*ts;
        return any_ref.downcast_ref::<Bitmap>().cloned().map(|b| BitmapCapture {
            bitmap: b,
            image_width: w,
            image_height: h,
        });
    }
    let image_ref = as_image_resource_ref(image)?;

    let entity_id = {
        let guard = image_ref.read().unwrap();
        get_entity_id(&*guard)
    };

    {
        let mut guard = cache.lock().unwrap();
        guard.retain(|_, entry| entry.weak_source.upgrade().is_some());
        if let Some(entry) = guard.get(&entity_id) {
            return Some(BitmapCapture {
                bitmap: entry.bitmap.clone(),
                image_width: w,
                image_height: h,
            });
        }
    }

    let bitmap = capture_bitmap_from_image_resource(host_bitmap_readback, &image_ref)?;
    {
        let mut guard = cache.lock().unwrap();
        guard.insert(entity_id, CachedBitmapEntry {
            weak_source: Arc::downgrade(image),
            bitmap: bitmap.clone(),
        });
    }
    return Some(BitmapCapture {
        bitmap,
        image_width: w,
        image_height: h,
    });
}

fn hit_test_sprite_alpha(
    host_bitmap_readback: &HostBitmapReadbackCapability,
    source: &NodeRef,
    x: f32,
    y: f32,
    alpha_threshold: u8,
    cache: &Mutex<HashMap<u64, CachedBitmapEntry>>,
) -> i32 {
    if !hit_test_graph_local_bounds(source, x, y) {
        return -1;
    }

    let node = source.read().unwrap();
    let Some(sprite) = node.as_any().downcast_ref::<Sprite>() else {
        return 0;
    };
    let texture_ref = match &sprite.data.texture {
        Some(t) => t.clone(),
        None => return 0,
    };
    drop(node);

    let texture = texture_ref.read().unwrap();
    let (texture_source, uv_offset) = match &*texture {
        Texture::Texture2D(t2d) => {
            let src = match &t2d.source {
                Some(s) => s.clone(),
                None => return 0,
            };
            let uv = t2d.uv_offset.clone();
            (src, uv)
        }
        _ => return 0,
    };
    drop(texture);

    let Some(capture) = bitmap_for_image(host_bitmap_readback, &texture_source, cache) else {
        return 0;
    };

    let mut revisions = NodeRevisionState::default();
    let matrix = get_node_world_matrix(source, &mut revisions);
    let mut local_point = create_vector2(0.0, 0.0);
    inverse_matrix_transform_point_xy(&mut local_point, &matrix, x, y);

    let px = (uv_offset.x * capture.image_width as f32 + local_point.x).floor() as i32;
    let py = (uv_offset.y * capture.image_height as f32 + local_point.y).floor() as i32;
    let bmp_fields = capture.bitmap.texture_source_fields();
    if px < 0 || py < 0 || px >= bmp_fields.width as i32 || py >= bmp_fields.height as i32 {
        return -1;
    }
    if get_bitmap_pixel_channel(&capture.bitmap, px as u32, py as u32, ImageChannel::Alpha) >= alpha_threshold {
        return 0;
    }
    return -1;
}

// flight-lint: allow(conform-params) D5: caller-owned hit test context; host_bitmap_readback is caller-provided capability
pub fn register_sprite_hit_test(
    ctx: &mut HitTestContext,
    host_bitmap_readback: Arc<HostBitmapReadbackCapability>,
    alpha_threshold: Option<u8>,
) {
    let threshold = alpha_threshold.unwrap_or(1);
    let cache: Arc<Mutex<HashMap<u64, CachedBitmapEntry>>> = Arc::new(Mutex::new(HashMap::new()));
    register_hit_test_precise(
        ctx,
        SPRITE_KIND.to_string(),
        Arc::new(move |source, x, y| hit_test_sprite_alpha(&host_bitmap_readback, source, x, y, threshold, &cache)),
    );
}
