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
        let mut path = create_path();
        path.winding = source.winding;
        path
    };
    reverse_path(&path.read().unwrap(), &mut reversed);
    return Arc::new(RwLock::new(reversed));
}
