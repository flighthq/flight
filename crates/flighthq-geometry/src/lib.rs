//! `flighthq-geometry` — 2D/3D math primitives.
//!
//! Provides free functions over the geometry types defined in `flighthq-types`:
//! vectors, affine matrices, rectangles, typed-array helpers, and a generic
//! object pool for acquire/release bracket allocation.

pub mod aabb;
pub mod matrix;
pub mod matrix3;
pub mod matrix4;
pub mod pool;
pub mod pools;
pub mod ray3d;
pub mod rectangle;
pub mod typedarray;
pub mod vector2;
pub mod vector3;
pub mod vector4;

// Re-export the complete public surface at the crate root.

// aabb
pub use aabb::{
    clone_aabb, copy_aabb, create_aabb, expand_aabb_by_point, expand_aabb_by_sphere,
    get_aabb_center, get_aabb_contains_point, get_aabb_extents, get_aabb_size,
    get_closest_point_on_aabb, intersect_aabb, intersects_aabb, set_aabb, set_aabb_from_points,
    transform_aabb_by_matrix4, union_aabb,
};

// matrix
pub use matrix::{
    clone_matrix, copy_matrix, copy_matrix_column_from_vector3, copy_matrix_column_to_vector3,
    copy_matrix_row_from_vector3, copy_matrix_row_to_vector3, create_gradient_transform_matrix,
    create_matrix, create_transform_matrix, equals_matrix, inverse_matrix,
    inverse_matrix_transform_point, inverse_matrix_transform_point_xy,
    inverse_matrix_transform_vector, inverse_matrix_transform_vector_xy, matrix_transform_bounds,
    matrix_transform_bounds_vector2, matrix_transform_point, matrix_transform_point_xy,
    matrix_transform_rectangle, matrix_transform_vector, matrix_transform_vector_xy,
    multiply_matrix, rotate_matrix, scale_matrix, set_gradient_transform_matrix, set_matrix,
    set_matrix_from_f32_slice, set_matrix_from_matrix3, set_matrix_from_matrix4,
    set_matrix_identity, set_transform_matrix, translate_matrix, translate_matrix_by_vector,
    translate_matrix_by_vector_xy, write_matrix_to_f32_slice,
};

// matrix3
pub use matrix3::{
    clone_matrix3, copy_matrix3, copy_matrix3_column_from_vector3, copy_matrix3_column_to_vector3,
    copy_matrix3_row_from_vector3, copy_matrix3_row_to_vector3, create_matrix3,
    create_matrix3_identity, equals_matrix3, get_matrix3_element, inverse_matrix3,
    is_affine_matrix3, multiply_matrix3, rotate_matrix3, scale_matrix3, set_matrix3,
    set_matrix3_element, set_matrix3_from_matrix, set_matrix3_from_matrix4, set_matrix3_identity,
    translate_matrix3,
};

// matrix4
pub use matrix4::{
    append_matrix4, append_rotation_matrix4, append_scale_matrix4, append_translation_matrix4,
    clone_matrix4, copy_matrix4, copy_matrix4_column_from_vector4, copy_matrix4_column_to_vector4,
    copy_matrix4_row_from_vector4, copy_matrix4_row_to_vector4, create_matrix4_from_2d,
    create_matrix4_identity, create_orthographic_matrix4, create_perspective_matrix4,
    equals_matrix4, get_matrix4_determinant, get_matrix4_element, get_matrix4_position,
    interpolate_matrix4, inverse_matrix4, is_affine_matrix4, matrix4_transform_point,
    matrix4_transform_vector, matrix4_transform_vectors, multiply_matrix4, prepend_matrix4,
    prepend_rotation_matrix4, prepend_scale_matrix4, prepend_translation_matrix4, rotate_matrix4,
    scale_matrix4, set_matrix4, set_matrix4_element, set_matrix4_from_2d, set_matrix4_from_matrix,
    set_matrix4_from_matrix3, set_matrix4_identity, set_matrix4_position, set_orthographic_matrix4,
    set_perspective_matrix4, translate_matrix4, transpose_matrix4,
};

// pool
pub use pool::Pool;

// pools (named global object pools mirroring the TS *Pool modules)
pub use pools::{
    acquire_empty_rectangle, acquire_empty_vector2, acquire_empty_vector3, acquire_empty_vector4,
    acquire_identity_matrix, acquire_identity_matrix3, acquire_identity_matrix4, acquire_matrix,
    acquire_matrix3, acquire_matrix4, acquire_rectangle, acquire_vector2, acquire_vector3,
    acquire_vector4, clear_matrix_pool, clear_matrix3_pool, clear_matrix4_pool,
    clear_rectangle_pool, clear_vector2_pool, clear_vector3_pool, clear_vector4_pool,
    release_matrix, release_matrix3, release_matrix4, release_rectangle, release_vector2,
    release_vector3, release_vector4,
};

// ray3d
pub use ray3d::{
    create_ray3d, get_closest_point_between_ray3ds, get_closest_point_on_ray3d, get_ray3d_point_at,
    intersect_ray3d_aabb, intersect_ray3d_plane, intersect_ray3d_sphere, intersect_ray3d_triangle,
    set_ray3d,
};

// rectangle
pub use rectangle::{
    clone_rectangle, compute_rectangle_intersection, contains_rectangle_point,
    contains_rectangle_point_xy, copy_rectangle, create_rectangle, encloses_rectangle,
    equals_rectangle, expand_rectangle_to_point, get_rectangle_bottom, get_rectangle_bottom_right,
    get_rectangle_left, get_rectangle_max_x, get_rectangle_max_y, get_rectangle_min_x,
    get_rectangle_min_y, get_rectangle_normalized_bottom_right, get_rectangle_normalized_top_left,
    get_rectangle_right, get_rectangle_size, get_rectangle_top, get_rectangle_top_left,
    inflate_rectangle, intersects_rectangle, is_empty_rectangle, is_flipped_x_rectangle,
    is_flipped_y_rectangle, merge_rectangle, normalize_rectangle, offset_rectangle,
    offset_rectangle_by_point, set_empty_rectangle, set_rectangle, set_rectangle_bottom,
    set_rectangle_bottom_right, set_rectangle_left, set_rectangle_right, set_rectangle_size,
    set_rectangle_top, set_rectangle_top_left,
};

// typedarray
pub use typedarray::{
    reserve, reserve_f32, reserve_float32_array, reserve_i16, reserve_int16_array, reserve_u16,
    reserve_uint16_array,
};

// vector2
pub use vector2::{
    VECTOR2_X_AXIS, VECTOR2_Y_AXIS, add_vector2, clone_vector2, copy_vector2, create_vector2,
    create_vector2_from_polar, equals_vector2, get_vector2_angle_between, get_vector2_distance,
    get_vector2_distance_squared, get_vector2_dot, get_vector2_length, get_vector2_length_squared,
    interpolate_vector2, near_equals_vector2, negate_vector2, normalize_vector2, offset_vector2,
    scale_vector2, set_vector2, set_vector2_from_f32_slice, set_vector2_from_polar,
    subtract_vector2, write_vector2_to_f32_slice,
};

// vector3
pub use vector3::{
    VECTOR3_X_AXIS, VECTOR3_Y_AXIS, VECTOR3_Z_AXIS, add_vector3, clone_vector3, copy_vector3,
    create_vector3, cross_vector3, equals_vector3, get_vector3_angle_between, get_vector3_distance,
    get_vector3_distance_squared, get_vector3_dot, get_vector3_length, get_vector3_length_squared,
    near_equals_vector3, negate_vector3, normalize_vector3, offset_vector3, project_vector3,
    scale_vector3, set_vector3, subtract_vector3,
};

// vector4
pub use vector4::{
    VECTOR4_W_UNIT, VECTOR4_X_AXIS, VECTOR4_Y_AXIS, VECTOR4_Z_AXIS, add_vector4, clone_vector4,
    copy_vector4, create_vector4, equals_vector4, get_vector4_angle_between, get_vector4_distance,
    get_vector4_distance_squared, get_vector4_dot, get_vector4_length, get_vector4_length_squared,
    near_equals_vector4, negate_vector4, normalize_vector4, offset_vector4, project_vector4,
    scale_vector4, set_vector4, subtract_vector4,
};
