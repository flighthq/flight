use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_path::{Path, create_path, reverse_path};

/// Applies the direction convention shared by every Lottie geometry item.
///
pub fn apply_lottie_shape_direction(path: Ref<Path>, direction: Option<i32>) -> Ref<Path> {
    if direction != Some(3) {
        return path;
    }
    let mut reversed = {
        let source = path.read().unwrap();
        let mut created = create_path(Some(flight_path::PathWinding::NonZero));
        created.winding = source.winding;
        created
    };
    reverse_path(&path.read().unwrap(), &mut reversed);
    return Arc::new(RwLock::new(reversed));
}
