# API Drift Inventory

Status: **HISTORICAL SNAPSHOT (2026-10-20) of the earlier Rust port's drift.** Phase 3 restored most entries toward TS (D0 / D9a), including the options objects. The live list is `agents/baselines/conform.txt`: 127 entries on 2026-10-21, mostly flight-geometry (frozen manifest, awaiting a user-approved rename to the TS names) plus array negotiation items. The Phase 4 section at the end is current.

Generated 2026-10-20 by `cargo-flight-lint conform ../refs/flight/packages` against flighthq/flight. Each entry is a place where the existing Rust port differs from the TS signature. These are drift that already happened during the port; they are not proposed changes. The same entries are recorded in `agents/baselines/conform.txt`, which only stops *new* drift. Being in the baseline does not mean an entry is accepted.

Categories:
- **order**: same parameter names in a different order. A transpiler passes arguments by position, so these break callers.
- **count**: a different number of parameters, e.g. a TS options object split into positional arguments, or `out` parameters added or removed.
- **names**: same count, different names.
- **missing**: a TS export with no Rust function.
- **extra**: a Rust pub function with no TS export.

Totals: order 5, count 57, names 94, missing 75, extra 112.

## flight-adjustments (35)

**order** (1)

- `multiply_color_matrix` — Rust `(out, a, b)` · TS `(a, b, out)`

**count** (13)

- `create_brightness_contrast_adjustment` — Rust `(brightness, contrast)` · TS `(options)`
- `create_color_grade_adjustment` — Rust `(exposure, brightness, contrast, saturation, temperature, tint, lift, gamma, gain)` · TS `(options)`
- `create_hue_saturation_adjustment` — Rust `(hue, saturation, lightness)` · TS `(options)`
- `create_lift_gamma_gain_adjustment` — Rust `(lift, gamma, gain)` · TS `(options)`
- `create_lookup_table_grade_adjustment` — Rust `(lut, strength)` · TS `(options)`
- `initialize_adjustment` — Rust `(adjustment)` · TS `(out, kind)`
- `initialize_brightness_contrast_adjustment` — Rust `(out, brightness, contrast)` · TS `(out, options)`
- `initialize_color_grade_adjustment` — Rust `(out, exposure, brightness, contrast, saturation, temperature, tint, lift, gamma, gain)` · TS `(out, options)`
- `initialize_color_lut_adjustment` — Rust `(adjustment)` · TS `(out, kind, transform)`
- `initialize_color_matrix_adjustment` — Rust `(out, color_matrix)` · TS `(out, kind, color_matrix)`
- `initialize_hue_saturation_adjustment` — Rust `(out, hue, saturation, lightness)` · TS `(out, options)`
- `initialize_lift_gamma_gain_adjustment` — Rust `(out, lift, gamma, gain)` · TS `(out, options)`
- `initialize_lookup_table_grade_adjustment` — Rust `(out, lut, strength)` · TS `(out, options)`

**names** (17)

- `bake_color_lut` — Rust `(adjustments, size)` · TS `(transforms, size)`
- `create_channel_mixer_adjustment` — Rust `(matrix)` · TS `(options)`
- `create_color_blind_simulation_adjustment` — Rust `(color_blind_type)` · TS `(options)`
- `create_exposure_adjustment` — Rust `(exposure)` · TS `(options)`
- `create_grayscale_adjustment` — Rust `(intensity)` · TS `(options)`
- `create_invert_adjustment` — Rust `(intensity)` · TS `(options)`
- `create_sepia_adjustment` — Rust `(intensity)` · TS `(options)`
- `get_adjustment_color_matrix` — Rust `(adjustment)` · TS `(operation)`
- `get_adjustment_color_transform` — Rust `(adjustment)` · TS `(operation)`
- `initialize_channel_mixer_adjustment` — Rust `(out, matrix)` · TS `(out, options)`
- `initialize_color_blind_simulation_adjustment` — Rust `(out, color_blind_type)` · TS `(out, options)`
- `initialize_exposure_adjustment` — Rust `(out, exposure)` · TS `(out, options)`
- `initialize_grayscale_adjustment` — Rust `(out, intensity)` · TS `(out, options)`
- `initialize_invert_adjustment` — Rust `(out, intensity)` · TS `(out, options)`
- `initialize_sepia_adjustment` — Rust `(out, intensity)` · TS `(out, options)`
- `is_color_lut_adjustment` — Rust `(adjustment)` · TS `(operation)`
- `is_color_matrix_adjustment` — Rust `(adjustment)` · TS `(operation)`

**extra** (4)

- `apply_color_transform`
- `create_color_scale_bias`
- `get_adjustment_kind`
- `initialize_color_scale_bias`

## flight-animation (4)

**extra** (4)

- `create_animation_blend_tree_ref`
- `create_animation_clip_rc`
- `create_animation_state_machine_ref`
- `linear_easing_identity`

## flight-binpack (9)

**extra** (9)

- `create_bin_pack_options`
- `create_pack_result`
- `create_packable_rectangle`
- `create_packed_rectangle`
- `create_unpacked_rectangle_explanation`
- `initialize_pack_result`
- `initialize_packable_rectangle`
- `initialize_packed_rectangle`
- `initialize_unpacked_rectangle_explanation`

## flight-bitmap (9)

**count** (1)

- `resize_bitmap` — Rust `(dest, source, mode, edge_mode, premultiplied)` · TS `(dest, source, options)`

**names** (6)

- `capture_bitmap_from_image_resource` — Rust `(host, resource)` · TS `(host_bitmap_readback, resource)`
- `create_bitmap_from_image_source` — Rust `(host, source, width, height)` · TS `(host_bitmap_readback, source, width, height)`
- `encode_bitmap` — Rust `(host, source, format, quality)` · TS `(host_bitmap_encode, source, format, quality)`
- `explain_bitmap_encode_failure` — Rust `(host, format)` · TS `(host_bitmap_encode, format)`
- `explain_bitmap_readback` — Rust `(host, source, width, height)` · TS `(host_bitmap_readback, source, width, height)`
- `resolve_bitmap_readback` — Rust `(host, source, width, height, mode)` · TS `(host_bitmap_readback, source, width, height, mode)`

**extra** (2)

- `clamp_u8`
- `resolve_edge`

## flight-collision (85)

**order** (3)

- `raycast_collision_shape2d` — Rust `(shape, origin_x, origin_y, direction_x, direction_y, max_fraction, out)` · TS `(shape, origin_x, origin_y, direction_x, direction_y, out, max_fraction)`
- `raycast_collision_shape3d` — Rust `(shape, origin_x, origin_y, origin_z, direction_x, direction_y, direction_z, max_fraction, out)` · TS `(shape, origin_x, origin_y, origin_z, direction_x, direction_y, direction_z, out, max_fraction)`
- `raycast_collision_triangle_mesh3d` — Rust `(mesh, origin_x, origin_y, origin_z, direction_x, direction_y, direction_z, max_fraction, out)` · TS `(mesh, origin_x, origin_y, origin_z, direction_x, direction_y, direction_z, out, max_fraction)`

**count** (21)

- `explain_collision_test2d` — Rust `(a, b, out)` · TS `(a, b)`
- `explain_collision_test3d` — Rust `(a, b, out)` · TS `(a, b)`
- `get_collision_pair_test2d` — Rust `(a, b, out)` · TS `(kind_a, kind_b)`
- `get_collision_pair_test3d` — Rust `(a, b, out)` · TS `(kind_a, kind_b)`
- `get_collision_support2d` — Rust `(shape, direction_x, direction_y, out)` · TS `(kind)`
- `get_collision_support3d` — Rust `(shape, direction_x, direction_y, direction_z, out)` · TS `(kind)`
- `register_collision_pair_test2d` — Rust `(kind_a, kind_b)` · TS `(kind_a, kind_b, test)`
- `register_collision_pair_test3d` — Rust `(kind_a, kind_b)` · TS `(kind_a, kind_b, test)`
- `register_collision_support2d` — Rust `(kind)` · TS `(kind, support)`
- `register_collision_support3d` — Rust `(kind)` · TS `(kind, support)`
- `sweep_collision_heightfield3d` — Rust `(hf, shape, velocity_x, velocity_y, velocity_z, out)` · TS `(convex, delta_x, delta_y, delta_z, heightfield, out, max_fraction)`
- `sweep_collision_shape2d` — Rust `(a, b, velocity_x, velocity_y, out)` · TS `(shape_a, translation_ax, translation_ay, shape_b, translation_bx, translation_by, out, max_fraction)`
- `sweep_collision_shape3d` — Rust `(a, b, velocity_x, velocity_y, velocity_z, out)` · TS `(shape_a, translation_ax, translation_ay, translation_az, shape_b, translation_bx, translation_by, translation_bz, out, max_fraction)`
- `sweep_collision_triangle_mesh3d` — Rust `(mesh, shape, velocity_x, velocity_y, velocity_z, out)` · TS `(convex, delta_x, delta_y, delta_z, mesh, out, max_fraction)`
- `test_segment_aabb_collision2d` — Rust `(seg, aabb, out_x, out_y, out_t)` · TS `(a, b)`
- `test_segment_capsule_collision2d` — Rust `(seg, capsule, out_x, out_y, out_t)` · TS `(a, b)`
- `test_segment_circle_collision2d` — Rust `(seg, circle, out_x, out_y, out_t)` · TS `(a, b)`
- `test_segment_obb_collision2d` — Rust `(seg, obb, out_x, out_y, out_t)` · TS `(a, b)`
- `test_segment_polygon_collision2d` — Rust `(seg, poly, out_x, out_y, out_t)` · TS `(a, b)`
- `test_segment_segment_collision2d` — Rust `(a, b, out_x, out_y, out_t)` · TS `(a, b)`
- `write_collision_distance3d` — Rust `(a, b, out)` · TS `(a, b, out, offset_x, offset_y, offset_z)`

**names** (14)

- `collide_collision_heightfield3d` — Rust `(hf, shape, out)` · TS `(convex, heightfield, out)`
- `collide_collision_triangle_mesh3d` — Rust `(mesh, shape, out)` · TS `(convex, mesh, out)`
- `get_collision_heightfield_validation_status3d` — Rust `(hf)` · TS `(heightfield)`
- `get_collision_shape_contains_point2d` — Rust `(shape, px, py)` · TS `(shape, x, y)`
- `get_collision_shape_contains_point3d` — Rust `(shape, px, py, pz)` · TS `(shape, x, y, z)`
- `invalidate_collision_heightfield3d` — Rust `(hf)` · TS `(heightfield)`
- `raycast_collision_heightfield3d` — Rust `(hf, origin_x, origin_y, origin_z, direction_x, direction_y, direction_z, max_fraction, out)` · TS `(heightfield, origin_x, origin_y, origin_z, direction_x, direction_y, direction_z, out, max_fraction)`
- `support_collision_aabb2d` — Rust `(shape, direction_x, direction_y, out)` · TS `(shape, dir_x, dir_y, out)`
- `support_collision_circle2d` — Rust `(shape, direction_x, direction_y, out)` · TS `(shape, dir_x, dir_y, out)`
- `support_collision_obb2d` — Rust `(shape, direction_x, direction_y, out)` · TS `(shape, dir_x, dir_y, out)`
- `support_collision_polygon2d` — Rust `(shape, direction_x, direction_y, out)` · TS `(shape, dir_x, dir_y, out)`
- `write_collision_convex_hull_faces3d` — Rust `(points, out_indices)` · TS `(points, out)`
- `write_collision_heightfield_bounds3d` — Rust `(hf, out)` · TS `(heightfield, out)`
- `write_vertex_list_support2d` — Rust `(vertices, count, direction_x, direction_y, out)` · TS `(vertices, count, dir_x, dir_y, out)`

**missing** (25)

- `collideAabbAabbContactManifold2D` (public, collision/src/shapeContact2D.ts)
- `collideAabbObbContactManifold2D` (public, collision/src/shapeContact2D.ts)
- `collideAabbPolygonContactManifold2D` (public, collision/src/shapeContact2D.ts)
- `collideCapsuleAabbContactManifold2D` (public, collision/src/capsuleContact2D.ts)
- `collideCapsuleCapsuleContactManifold2D` (public, collision/src/capsuleContact2D.ts)
- `collideCapsuleObbContactManifold2D` (public, collision/src/capsuleContact2D.ts)
- `collideCapsulePolygonContactManifold2D` (public, collision/src/capsuleContact2D.ts)
- `collideCircleAabbContactManifold2D` (public, collision/src/shapeContact2D.ts)
- `collideCircleCapsuleContactManifold2D` (public, collision/src/capsuleContact2D.ts)
- `collideCircleCircleContactManifold2D` (public, collision/src/shapeContact2D.ts)
- `collideCircleObbContactManifold2D` (public, collision/src/shapeContact2D.ts)
- `collideCirclePolygonContactManifold2D` (public, collision/src/shapeContact2D.ts)
- `collideObbObbContactManifold2D` (public, collision/src/shapeContact2D.ts)
- `collideObbPolygonContactManifold2D` (public, collision/src/shapeContact2D.ts)
- `collidePolygonPolygonContactManifold2D` (public, collision/src/shapeContact2D.ts)
- `getCollisionFaceQuery3D` (public, collision/src/collisionFace3D.ts)
- `initializeCollisionHeightfield3D` (contract-only, collision/src/triangleMesh3D.ts)
- `initializeCollisionTriangleMesh3D` (contract-only, collision/src/triangleMesh3D.ts)
- `queryCollisionAabbFace3D` (public, collision/src/collisionFace3D.ts)
- `queryCollisionBoxFace3D` (public, collision/src/collisionFace3D.ts)
- `queryCollisionCapsuleFace3D` (public, collision/src/collisionFace3D.ts)
- `queryCollisionConvexFace3D` (public, collision/src/collisionFace3D.ts)
- `registerBuiltInCollisionFaceQueries3D` (public, collision/src/collisionFace3D.ts)
- `registerCollisionFaceQuery3D` (public, collision/src/collisionFace3D.ts)
- `writeVertexListSupport3D` (public, collision/src/collisionSupport3D.ts)

**extra** (22)

- `collide_aabb_aabb_contact`
- `collide_aabb_obb_contact`
- `collide_aabb_polygon_contact`
- `collide_capsule_aabb`
- `collide_capsule_capsule`
- `collide_capsule_obb`
- `collide_capsule_polygon`
- `collide_circle_aabb_contact`
- `collide_circle_capsule`
- `collide_circle_circle_contact`
- `collide_circle_obb_contact`
- `collide_circle_polygon_contact`
- `collide_obb_obb_contact`
- `collide_obb_polygon_contact`
- `collide_polygon_polygon_contact`
- `has_collision_support2d`
- `has_collision_support3d`
- `support_collision_capsule2d`
- `write_collision_aabb_face3d`
- `write_collision_box_face3d`
- `write_collision_capsule_face3d`
- `write_collision_convex_face3d`

## flight-color (1)

**names** (1)

- `oklab_to_linear_rgb` — Rust `(out, l_val, a, b)` · TS `(out, l, a, b)`

## flight-compression (4)

**extra** (4)

- `create_sdk_host_compress_deflate`
- `create_sdk_host_compress_lzma`
- `create_sdk_host_decompress_deflate`
- `create_sdk_host_decompress_lzma`

## flight-easing (3)

**count** (1)

- `create_easing_samples` — Rust `(ease, count)` · TS `(ease, count, out)`

**extra** (2)

- `create_easing_segment`
- `initialize_easing_samples`

## flight-entity (1)

**extra** (1)

- `report_entity_runtime_write`

## flight-flow (1)

**extra** (1)

- `report_flow_guard`

## flight-geometry (77)

**count** (8)

- `create_matrix3` — Rust `()` · TS `(m00, m01, m02, m10, m11, m12, m20, m21, m22)`
- `create_matrix4` — Rust `()` · TS `(m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33)`
- `initialize_aabb` — Rust `(out, min_x, min_y, min_z, max_x, max_y, max_z)` · TS `(out, min, max)`
- `initialize_bounding_sphere` — Rust `(out, center_x, center_y, center_z, radius)` · TS `(out, center, radius)`
- `initialize_matrix3` — Rust `(out)` · TS `(out, m)`
- `initialize_matrix4` — Rust `(out)` · TS `(out, m)`
- `initialize_ray3d` — Rust `(out, origin_x, origin_y, origin_z, direction_x, direction_y, direction_z)` · TS `(out, origin, direction)`
- `initialize_transform3d` — Rust `(out)` · TS `(out, position, rotation, scale)`

**names** (28)

- `contains_rectangle_point_xy` — Rust `(rect, x, y)` · TS `(source, x, y)`
- `contains_rectangle_point` — Rust `(rect, point)` · TS `(source, vector)`
- `encloses_rectangle` — Rust `(rect, other)` · TS `(source, other)`
- `expand_rectangle_to_point` — Rust `(out, source, point)` · TS `(out, source_rect, source_vec2)`
- `get_rectangle_bottom_right` — Rust `(out, rect)` · TS `(out, source)`
- `get_rectangle_bottom` — Rust `(rect)` · TS `(source)`
- `get_rectangle_left` — Rust `(rect)` · TS `(source)`
- `get_rectangle_max_x` — Rust `(rect)` · TS `(source)`
- `get_rectangle_max_y` — Rust `(rect)` · TS `(source)`
- `get_rectangle_min_x` — Rust `(rect)` · TS `(source)`
- `get_rectangle_min_y` — Rust `(rect)` · TS `(source)`
- `get_rectangle_normalized_bottom_right` — Rust `(out, rect)` · TS `(out, source)`
- `get_rectangle_normalized_top_left` — Rust `(out, rect)` · TS `(out, source)`
- `get_rectangle_right` — Rust `(rect)` · TS `(source)`
- `get_rectangle_size` — Rust `(out, rect)` · TS `(out, source)`
- `get_rectangle_top_left` — Rust `(out, rect)` · TS `(out, source)`
- `get_rectangle_top` — Rust `(rect)` · TS `(source)`
- `is_empty_rectangle` — Rust `(rect)` · TS `(source)`
- `is_flipped_x_rectangle` — Rust `(rect)` · TS `(source)`
- `is_flipped_y_rectangle` — Rust `(rect)` · TS `(source)`
- `merge_rectangle` — Rust `(out, a, b)` · TS `(out, source, other)`
- `set_rectangle_bottom_right` — Rust `(rect, point)` · TS `(target, point)`
- `set_rectangle_bottom` — Rust `(rect, value)` · TS `(target, value)`
- `set_rectangle_left` — Rust `(rect, value)` · TS `(target, value)`
- `set_rectangle_right` — Rust `(rect, value)` · TS `(target, value)`
- `set_rectangle_size` — Rust `(rect, size)` · TS `(out, size)`
- `set_rectangle_top_left` — Rust `(rect, point)` · TS `(out, point)`
- `set_rectangle_top` — Rust `(rect, value)` · TS `(target, value)`

**missing** (39)

- `acquireEmptyRectangle` (public, geometry/src/rectanglePool.ts)
- `acquireEmptyVector2` (public, geometry/src/vector2Pool.ts)
- `acquireEmptyVector3` (public, geometry/src/vector3Pool.ts)
- `acquireEmptyVector4` (public, geometry/src/vector4Pool.ts)
- `acquireIdentityMatrix3` (public, geometry/src/matrix3Pool.ts)
- `acquireIdentityMatrix4` (public, geometry/src/matrix4Pool.ts)
- `acquireIdentityMatrix` (public, geometry/src/matrixPool.ts)
- `acquireIdentityQuaternion` (public, geometry/src/quaternionPool.ts)
- `acquireMatrix3` (public, geometry/src/matrix3Pool.ts)
- `acquireMatrix4` (public, geometry/src/matrix4Pool.ts)
- `acquireMatrix` (public, geometry/src/matrixPool.ts)
- `acquireQuaternion` (public, geometry/src/quaternionPool.ts)
- `acquireRectangle` (public, geometry/src/rectanglePool.ts)
- `acquireVector2` (public, geometry/src/vector2Pool.ts)
- `acquireVector3` (public, geometry/src/vector3Pool.ts)
- `acquireVector4` (public, geometry/src/vector4Pool.ts)
- `areGeometryPoolGuardsEnabled` (public, geometry/src/enableGeometryPoolGuards.ts)
- `clearMatrix3Pool` (public, geometry/src/matrix3Pool.ts)
- `clearMatrix4Pool` (public, geometry/src/matrix4Pool.ts)
- `clearMatrixPool` (public, geometry/src/matrixPool.ts)
- `clearQuaternionPool` (public, geometry/src/quaternionPool.ts)
- `clearRectanglePool` (public, geometry/src/rectanglePool.ts)
- `clearVector2Pool` (public, geometry/src/vector2Pool.ts)
- `clearVector3Pool` (public, geometry/src/vector3Pool.ts)
- `clearVector4Pool` (public, geometry/src/vector4Pool.ts)
- `disableGeometryPoolGuards` (public, geometry/src/enableGeometryPoolGuards.ts)
- `enableGeometryPoolGuards` (public, geometry/src/enableGeometryPoolGuards.ts)
- `releaseMatrix3` (public, geometry/src/matrix3Pool.ts)
- `releaseMatrix4` (public, geometry/src/matrix4Pool.ts)
- `releaseMatrix` (public, geometry/src/matrixPool.ts)
- `releaseQuaternion` (public, geometry/src/quaternionPool.ts)
- `releaseRectangle` (public, geometry/src/rectanglePool.ts)
- `releaseVector2` (public, geometry/src/vector2Pool.ts)
- `releaseVector3` (public, geometry/src/vector3Pool.ts)
- `releaseVector4` (public, geometry/src/vector4Pool.ts)
- `reserveFloat32Array` (public, geometry/src/typedarray.ts)
- `reserveInt16Array` (public, geometry/src/typedarray.ts)
- `reserveUint16Array` (public, geometry/src/typedarray.ts)
- `setGeometryPoolReleaseGuard` (contract-only, geometry/src/geometryPoolGuards.ts)

**extra** (2)

- `create_matrix3_from_values`
- `create_matrix4_from_values`

## flight-log (8)

**count** (2)

- `create_rate_limited_log_sink` — Rust `(target, max_per_interval, interval_ms, per_channel)` · TS `(target, options)`
- `create_text_log_formatter` — Rust `(indent_groups, level_prefix, with_timestamp)` · TS `(options)`

**names** (2)

- `create_buffered_log_sink` — Rust `(target, size)` · TS `(target, options)`
- `register_log_serializer` — Rust `(kind, func)` · TS `(kind, fn)`

**missing** (4)

- `createConsoleCaptureSink` (public, log/src/log.ts)
- `createConsoleLogSink` (public, log/src/log.ts)
- `createFileLogSink` (public, log/src/log.ts)
- `destroyFileLogSink` (public, log/src/log.ts)

## flight-math (2)

**extra** (2)

- `initialize_random_source`
- `next_random`

## flight-mesh (15)

**count** (4)

- `compute_mesh_geometry_flat_normals` — Rust `(geometry)` · TS `(out, geometry)`
- `compute_mesh_geometry_normals` — Rust `(geometry, position_groups)` · TS `(out, geometry, position_groups)`
- `compute_mesh_geometry_tangents` — Rust `(geometry, position_groups)` · TS `(out, geometry, position_groups)`
- `transform_mesh_geometry_into` — Rust `(geometry, matrix)` · TS `(out, source, matrix)`

**names** (4)

- `compute_mesh_geometry_bounding_sphere` — Rust `(out_center, geometry)` · TS `(out, geometry)`
- `initialize_mesh_geometry` — Rust `(out, options)` · TS `(out, fields)`
- `read_vertex_format_component` — Rust `(data, byte_offset, format, component)` · TS `(view, byte_offset, format, component)`
- `write_vertex_format_component` — Rust `(data, byte_offset, format, component, value)` · TS `(view, byte_offset, format, component, value)`

**extra** (7)

- `canonical_mesh_geometry_layout`
- `canonical_skinned_mesh_geometry_layout`
- `get_index_count`
- `get_index_value`
- `is_float32_format`
- `vertices_as_bytes_mut`
- `vertices_as_bytes`

## flight-particles (1)

**extra** (1)

- `create_signal`

## flight-path (13)

**count** (4)

- `acquire_path_mesh` — Rust `(pool, path, tolerance)` · TS `(path, tolerance)`
- `copy_path` — Rust `(source)` · TS `(source, out)`
- `for_each_path_segment` — Rust `(path)` · TS `(path, visitor)`
- `release_path_mesh` — Rust `(pool, mesh)` · TS `(mesh)`

**missing** (5)

- `acquirePathMeshTyped` (public, path/src/pathMeshPool.ts)
- `initializePathMorph` (contract-only, path/src/pathMorphGeometry.ts)
- `releasePathMeshTyped` (public, path/src/pathMeshPool.ts)
- `tessellatePathTypedInto` (public, path/src/tessellatePathTyped.ts)
- `tessellatePathTyped` (public, path/src/tessellatePathTyped.ts)

**extra** (4)

- `copy_path_into`
- `create_path_mesh_pool`
- `create_path_mesh`
- `create_stroke_style`

## flight-path-boolean (13)

**order** (1)

- `write_path_boolean_contours` — Rust `(out, contours)` · TS `(contours, out)`

**names** (11)

- `boolean_paths` — Rust `(out, kernel, subject, clip, operation, options)` · TS `(path_boolean_kernel, subject, clip, operation, out, options)`
- `difference_paths` — Rust `(out, kernel, a, b, options)` · TS `(path_boolean_kernel, a, b, out, options)`
- `explain_offset_path` — Rust `(kernel, path, delta, options)` · TS `(path_boolean_kernel, path, delta, options)`
- `explain_simplify_path` — Rust `(kernel, path, options)` · TS `(path_boolean_kernel, path, options)`
- `intersect_paths` — Rust `(out, kernel, a, b, options)` · TS `(path_boolean_kernel, a, b, out, options)`
- `offset_path` — Rust `(out, kernel, path, delta, options)` · TS `(path_boolean_kernel, path, delta, options, out)`
- `resolve_path_regions` — Rust `(out, kernel, rings, fill_rule)` · TS `(path_boolean_kernel, rings, fill_rule, out)`
- `simplify_path` — Rust `(out, kernel, path, options)` · TS `(path_boolean_kernel, path, options, out)`
- `union_all_paths` — Rust `(out, kernel, paths, options)` · TS `(path_boolean_kernel, paths, out, options)`
- `union_paths` — Rust `(out, kernel, a, b, options)` · TS `(path_boolean_kernel, a, b, out, options)`
- `xor_paths` — Rust `(out, kernel, a, b, options)` · TS `(path_boolean_kernel, a, b, out, options)`

**extra** (1)

- `compute_path_boolean`

## flight-signals (8)

**count** (2)

- `connect_signal_tracked` — Rust `(signal, slot, options, scope)` · TS `(signal, slot, options)`
- `null_signal_emit` — Rust `(args)` · TS `()`

**extra** (6)

- `advance_timers_by_time`
- `clear_timeout`
- `now_ms`
- `set_timeout`
- `use_fake_timers`
- `use_real_timers`

## flight-spatial (18)

**count** (1)

- `report_spatial_indexing` — Rust `(guard, notice)` · TS `(notice)`

**names** (5)

- `create_spatial_index_2d` — Rust `(cell_size)` · TS `(backend)`
- `create_spatial_index_3d` — Rust `(cell_size)` · TS `(backend)`
- `initialize_spatial_index_2d` — Rust `(out, cell_size)` · TS `(out, backend)`
- `initialize_spatial_index_3d` — Rust `(out, cell_size)` · TS `(out, backend)`
- `initialize_uniform_grid_spatial_backend_2d` — Rust `(out, cell_size)` · TS `(out, grid)`

**missing** (1)

- `setSpatialIndexingGuard` (public, spatial/src/spatialIndexingGuard.ts)

**extra** (11)

- `create_bvh_3d`
- `create_spatial_aabb_2d`
- `create_spatial_aabb_3d`
- `create_spatial_frustum_3d`
- `create_spatial_index_3d_with_bvh`
- `create_spatial_pair`
- `initialize_spatial_aabb_2d`
- `initialize_spatial_aabb_3d`
- `initialize_spatial_pair`
- `set_spatial_indexing_guard_2d`
- `set_spatial_indexing_guard_3d`

## flight-spring (1)

**extra** (1)

- `initialize_spring_config`

## flight-statechart (7)

**extra** (7)

- `add_log_sink`
- `clear_log_once_keys`
- `create_memory_log_sink`
- `get_memory_log_sink_entries`
- `log_entry`
- `log_once`
- `remove_log_sink`

## flight-textbidi (6)

**extra** (6)

- `clear_log_entries`
- `clear_log_once_keys`
- `compact_bidi_class_kernel`
- `get_log_entries`
- `log_once`
- `set_log_sink`

## flight-textsegment (4)

**extra** (4)

- `create_web_text_segmenter_backend`
- `has_intl_segmenter`
- `set_intl_segmenter_available`
- `web_text_segmenter_backend`

## flight-tween (4)

**extra** (4)

- `create_tween_default`
- `create_tween_target`
- `default_manager`
- `target_key`

## flight-velocity (14)

**names** (6)

- `contribute_velocity` — Rust `(field, source_id, x, y)` · TS `(field, source, x, y)`
- `ensure_velocity_sample` — Rust `(field, source_id)` · TS `(field, source)`
- `explain_velocity` — Rust `(field, source_id)` · TS `(field, source)`
- `get_velocity` — Rust `(field, source_id, out)` · TS `(field, source, out)`
- `has_velocity` — Rust `(field, source_id)` · TS `(field, source)`
- `suppress_velocity` — Rust `(field, source_id)` · TS `(field, source)`

**missing** (1)

- `contributeTransformVelocity` (public, velocity/src/transformVelocity.ts)

**extra** (7)

- `clone_velocity2d`
- `create_velocity2d`
- `create_velocity_explanation`
- `create_velocity_sample`
- `initialize_velocity2d`
- `initialize_velocity_explanation`
- `initialize_velocity_sample`

## Array negotiation items (`conform-array`, updated 2026-10-20)

Mappings (vocabulary): `Vec<N>`/`&Vec<N>` → `number[]`; `&mut [N]`/`[N; LEN]`/`Box<[N]>`/`&Box<[N]>` → typed array; bare `&[N]` → `ArrayLike<number>`, used only when general is intended. Pixels: TS `Uint8ClampedArray` → `Uint8Array` is approved, so those entries need only the Rust code change. Specific over permissive (user): widening a specific TS input to `ArrayLike` is also a negotiation item. Each entry needs a decision: change the Rust type, accept the TS change (`allow(conform-array) <reason>`), or extend the vocabulary.

Summary:
- 25: Rust `Uint8Array` vs TS `Uint8ClampedArray`
- 21: Rust `Float32Array` vs TS `number[]`
- 21: Rust `ArrayLike<number>` vs TS `number[]`
- 16: Rust `Float32Array` vs TS `Float32Array | number[]`
- 13: Rust `ArrayLike<number>` vs TS `Uint8ClampedArray`
- 11: Rust `number[]` vs TS `Uint8ClampedArray`
- 11: Rust `ArrayLike<number>` vs TS `Float32Array`
- 7: Rust `number[]` vs TS `Uint8Array`
- 6: Rust `ArrayLike<number>` vs TS `Uint8Array`
- 1: Rust `ArrayLike<number>` vs TS `Uint32Array`
- 1: Rust `number[]` vs TS `Float32Array`

### flight-adjustments (21)

- `create_brightness_color_matrix` return: Rust → `Float32Array`, TS `number[]`
- `create_channel_mixer_color_matrix` return: Rust → `Float32Array`, TS `number[]`
- `create_color_balance_color_matrix` return: Rust → `Float32Array`, TS `number[]`
- `create_color_matrix_adjustment` param `color_matrix`: Rust → `Float32Array`, TS `number[]`
- `create_color_matrix_from_tint` return: Rust → `Float32Array`, TS `number[]`
- `create_contrast_color_matrix` return: Rust → `Float32Array`, TS `number[]`
- `create_desaturate_color_matrix` return: Rust → `Float32Array`, TS `number[]`
- `create_grayscale_color_matrix` return: Rust → `Float32Array`, TS `number[]`
- `create_hue_rotate_color_matrix` return: Rust → `Float32Array`, TS `number[]`
- `create_identity_color_matrix` return: Rust → `Float32Array`, TS `number[]`
- `create_invert_color_matrix` return: Rust → `Float32Array`, TS `number[]`
- `create_levels_color_matrix` return: Rust → `Float32Array`, TS `number[]`
- `create_opacity_color_matrix` return: Rust → `Float32Array`, TS `number[]`
- `create_polaroid_color_matrix` return: Rust → `Float32Array`, TS `number[]`
- `create_saturation_color_matrix` return: Rust → `Float32Array`, TS `number[]`
- `create_sepia_color_matrix` return: Rust → `Float32Array`, TS `number[]`
- `create_technicolor_color_matrix` return: Rust → `Float32Array`, TS `number[]`
- `create_vintage_color_matrix` return: Rust → `Float32Array`, TS `number[]`
- `create_white_balance_color_matrix` return: Rust → `Float32Array`, TS `number[]`
- `fuse_color_matrices` return: Rust → `Float32Array`, TS `number[]`
- `resolve_color_adjustments_color_matrix` return: Rust → `Float32Array`, TS `number[]`

### flight-animation (13)

- `add_animation_sample` param `out`: Rust → `Float32Array`, TS `Float32Array | number[]`
- `blend_animation_samples` param `out`: Rust → `Float32Array`, TS `Float32Array | number[]`
- `extract_animation_root_motion` param `out`: Rust → `Float32Array`, TS `Float32Array | number[]`
- `finish_animation_sample` param `out`: Rust → `Float32Array`, TS `Float32Array | number[]`
- `sample_animation_blend_tree_channel` param `out`: Rust → `Float32Array`, TS `Float32Array | number[]`
- `sample_animation_blend_tree` param `out`: Rust → `Float32Array`, TS `Float32Array | number[]`
- `sample_animation_clip` param `out`: Rust → `Float32Array`, TS `Float32Array | number[]`
- `sample_animation_crossfade` param `out`: Rust → `Float32Array`, TS `Float32Array | number[]`
- `sample_animation_layer_stack_channel` param `out`: Rust → `Float32Array`, TS `Float32Array | number[]`
- `sample_animation_layer_stack` param `out`: Rust → `Float32Array`, TS `Float32Array | number[]`
- `sample_animation_state_machine_channel` param `out`: Rust → `Float32Array`, TS `Float32Array | number[]`
- `sample_animation_state_machine` param `out`: Rust → `Float32Array`, TS `Float32Array | number[]`
- `sample_animation_track` param `out`: Rust → `Float32Array`, TS `Float32Array | number[]`

### flight-bitmap (62)

- `apply_bitmap_palette_map` param `alpha_map`: Rust → `ArrayLike<number>`, TS `number[]`
- `apply_bitmap_palette_map` param `blue_map`: Rust → `ArrayLike<number>`, TS `number[]`
- `apply_bitmap_palette_map` param `green_map`: Rust → `ArrayLike<number>`, TS `number[]`
- `apply_bitmap_palette_map` param `red_map`: Rust → `ArrayLike<number>`, TS `number[]`
- `bevel_bitmap` param `out`: Rust → `number[]`, TS `Uint8ClampedArray`
- `bevel_bitmap` param `scratch`: Rust → `number[]`, TS `Uint8ClampedArray`
- `blur_bitmap_pixels_horizontal_weighted` param `kernel`: Rust → `ArrayLike<number>`, TS `Float32Array`
- `blur_bitmap_pixels_horizontal_weighted` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `blur_bitmap_pixels_horizontal_weighted` param `source`: Rust → `ArrayLike<number>`, TS `Uint8ClampedArray`
- `blur_bitmap_pixels_horizontal` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `blur_bitmap_pixels_horizontal` param `source`: Rust → `ArrayLike<number>`, TS `Uint8ClampedArray`
- `blur_bitmap_pixels_vertical_weighted` param `kernel`: Rust → `ArrayLike<number>`, TS `Float32Array`
- `blur_bitmap_pixels_vertical_weighted` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `blur_bitmap_pixels_vertical_weighted` param `source`: Rust → `ArrayLike<number>`, TS `Uint8ClampedArray`
- `blur_bitmap_pixels_vertical` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `blur_bitmap_pixels_vertical` param `source`: Rust → `ArrayLike<number>`, TS `Uint8ClampedArray`
- `box_blur_bitmap` param `out`: Rust → `number[]`, TS `Uint8ClampedArray`
- `box_blur_bitmap` param `scratch`: Rust → `number[]`, TS `Uint8ClampedArray`
- `build_bitmap_gradient_ramp` param `alphas`: Rust → `ArrayLike<number>`, TS `number[]`
- `build_bitmap_gradient_ramp` param `colors`: Rust → `ArrayLike<number>`, TS `number[]`
- `build_bitmap_gradient_ramp` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `build_bitmap_gradient_ramp` param `ratios`: Rust → `ArrayLike<number>`, TS `number[]`
- `color_matrix_bitmap` param `matrix`: Rust → `ArrayLike<number>`, TS `number[]`
- `color_matrix_bitmap` param `out`: Rust → `number[]`, TS `Uint8ClampedArray`
- `composite_bitmap_pixels` param `pixels`: Rust → `ArrayLike<number>`, TS `Uint8ClampedArray`
- `convert_bitmap_pixel_order` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `convert_bitmap_pixel_order` param `source`: Rust → `ArrayLike<number>`, TS `Uint8ClampedArray`
- `convolve_bitmap` param `out`: Rust → `number[]`, TS `Uint8ClampedArray`
- `dilate_bitmap` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `displace_bitmap` param `out`: Rust → `number[]`, TS `Uint8ClampedArray`
- `drop_shadow_bitmap` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `drop_shadow_bitmap` param `scratch`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `encode_bitmap` return: Rust → `number[]`, TS `Uint8Array`
- `erode_bitmap` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `extract_bitmap_pixels` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `fill_bitmap_linear_gradient` param `ramp`: Rust → `ArrayLike<number>`, TS `Uint8ClampedArray`
- `fill_bitmap_radial_gradient` param `ramp`: Rust → `ArrayLike<number>`, TS `Uint8ClampedArray`
- `gaussian_blur_bitmap` param `out`: Rust → `number[]`, TS `Uint8ClampedArray`
- `gaussian_blur_bitmap` param `scratch`: Rust → `number[]`, TS `Uint8ClampedArray`
- `glow_bitmap` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `glow_bitmap` param `scratch`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `gradient_bevel_bitmap` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `gradient_bevel_bitmap` param `ramp`: Rust → `ArrayLike<number>`, TS `Uint8ClampedArray`
- `gradient_bevel_bitmap` param `scratch`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `gradient_glow_bitmap` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `gradient_glow_bitmap` param `ramp`: Rust → `ArrayLike<number>`, TS `Uint8ClampedArray`
- `gradient_glow_bitmap` param `scratch`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `initialize_bitmap_fingerprint` param `cells`: Rust → `number[]`, TS `Uint8Array`
- `inner_glow_bitmap` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `inner_glow_bitmap` param `scratch`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `inner_shadow_bitmap` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `inner_shadow_bitmap` param `scratch`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `median_bitmap` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `pixelate_bitmap` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `premultiply_bitmap_pixels` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `premultiply_bitmap_pixels` param `source`: Rust → `ArrayLike<number>`, TS `Uint8ClampedArray`
- `sharpen_bitmap` param `out`: Rust → `number[]`, TS `Uint8ClampedArray`
- `sharpen_bitmap` param `scratch`: Rust → `number[]`, TS `Uint8ClampedArray`
- `unpremultiply_bitmap_pixels` param `out`: Rust → `Uint8Array`, TS `Uint8ClampedArray`
- `unpremultiply_bitmap_pixels` param `source`: Rust → `ArrayLike<number>`, TS `Uint8ClampedArray`
- `write_bitmap_pixels32` param `pixels`: Rust → `ArrayLike<number>`, TS `Uint32Array`
- `write_bitmap_pixels` param `pixels`: Rust → `ArrayLike<number>`, TS `Uint8ClampedArray`

### flight-collision (3)

- `get_collision_convex_validation_status3d` param `points`: Rust → `ArrayLike<number>`, TS `number[]`
- `get_collision_polygon_validation_status2d` param `points`: Rust → `ArrayLike<number>`, TS `number[]`
- `write_collision_convex_hull_faces3d` param `points`: Rust → `ArrayLike<number>`, TS `number[]`

### flight-compression (7)

- `compress_deflate_zlib` param `bytes`: Rust → `ArrayLike<number>`, TS `Uint8Array`
- `compress_deflate_zlib` return: Rust → `number[]`, TS `Uint8Array`
- `compress_deflate` param `bytes`: Rust → `ArrayLike<number>`, TS `Uint8Array`
- `compress_deflate` return: Rust → `number[]`, TS `Uint8Array`
- `compress_lzma` param `bytes`: Rust → `ArrayLike<number>`, TS `Uint8Array`
- `compress_lzma` return: Rust → `number[]`, TS `Uint8Array`
- `compute_adler32` param `input`: Rust → `ArrayLike<number>`, TS `Uint8Array`

### flight-easing (1)

- `create_easing_samples` return: Rust → `number[]`, TS `Float32Array`

### flight-encoding (2)

- `decode_utf8` param `bytes`: Rust → `ArrayLike<number>`, TS `Uint8Array`
- `encode_utf8` return: Rust → `number[]`, TS `Uint8Array`

### flight-geometry (7)

- `matrix4_transform_vectors` param `vectors`: Rust → `ArrayLike<number>`, TS `Float32Array`
- `set_matrix3_from_float32_array` param `source`: Rust → `ArrayLike<number>`, TS `Float32Array`
- `set_matrix4_from_float32_array` param `source`: Rust → `ArrayLike<number>`, TS `Float32Array`
- `set_matrix_from_float32_array` param `source`: Rust → `ArrayLike<number>`, TS `Float32Array`
- `set_vector2_from_float32_array` param `source`: Rust → `ArrayLike<number>`, TS `Float32Array`
- `set_vector3_from_float32_array` param `source`: Rust → `ArrayLike<number>`, TS `Float32Array`
- `set_vector4_from_float32_array` param `source`: Rust → `ArrayLike<number>`, TS `Float32Array`

### flight-math (7)

- `mean` param `values`: Rust → `ArrayLike<number>`, TS `number[]`
- `median` param `values`: Rust → `ArrayLike<number>`, TS `number[]`
- `random_weighted` param `weights`: Rust → `ArrayLike<number>`, TS `number[]`
- `standard_deviation` param `values`: Rust → `ArrayLike<number>`, TS `number[]`
- `variance` param `values`: Rust → `ArrayLike<number>`, TS `number[]`
- `weighted_average` param `values`: Rust → `ArrayLike<number>`, TS `number[]`
- `weighted_average` param `weights`: Rust → `ArrayLike<number>`, TS `number[]`

### flight-particles (5)

- `lerp_hsv_direct` param `out`: Rust → `Float32Array`, TS `Float32Array | number[]`
- `lerp_hsv_in_place` param `birth`: Rust → `ArrayLike<number>`, TS `Float32Array`
- `lerp_hsv_in_place` param `colors_out`: Rust → `Float32Array`, TS `Float32Array | number[]`
- `lerp_hsv_in_place` param `death`: Rust → `ArrayLike<number>`, TS `Float32Array`
- `write_particle_spawn_offset` param `out`: Rust → `Float32Array`, TS `Float32Array | number[]`

### flight-path (3)

- `append_path_polygon` param `points`: Rust → `ArrayLike<number>`, TS `number[]`
- `append_path_polyline` param `points`: Rust → `ArrayLike<number>`, TS `number[]`
- `dash_path` param `dash`: Rust → `ArrayLike<number>`, TS `number[]`

### flight-textbidi (2)

- `reorder_bidi_line` param `levels`: Rust → `ArrayLike<number>`, TS `Uint8Array`
- `resolve_bidi_levels` return: Rust → `number[]`, TS `Uint8Array`

## Identity drift (D12)

- **flight-mesh `ensure_mesh_geometry_bounds`:** TS returns the cached `Aabb` object (identity). Rust returns an owned `Option<Aabb>` (a clone, so a fresh identity). Fix in the meshgeometry remediation by returning a borrow of the cache (`Option<&Aabb>`). Recorded 2026-10-21, deferred from WP8.

## TS defects and API trims found during Phase 4 (for the user's after-the-fact review)
- **app → surface `attachWindowRenderState`:** the `state: RenderState` parameter was never read or retained. It is removed in both Rust and TS, to avoid a surface → render cycle.
- **assets `acquireAsset`:** synchronous re-entry (or a sync-throwing `adapter.load`) leaves a half-initialized entry, and the function returns `null` despite its declared `Promise<T>`. Rust treats that branch as misuse (`throw_error`). Proposed TS fix: create the shared promise before calling `adapter.load`.
- **node `boundsRectangle` singular-axis epsilon:** TS `1e-12` became `1e-6` in Rust (f32 counterpart; f32 cos(π/2) ≈ -4.4e-8). This follows the D14 easing precedent; principal-approved, pending user review.
- **command property access:** TS reads and writes `node[property]` by string. Rust and the transpiled TS both use a `CommandPropertyAccess` registry keyed by (kind, property), filled by kind owners. Writes to unregistered properties are no-ops; JS would create an ad-hoc field.
- **scene2d `SpriteRendererData` create/initialize/isDirty:** the unused `state: RenderState` parameter is removed (avoids an upward dependency on render).
- **scene2d kind usage:** the shape command stream is read through a Node2D family hook (`shape_command_stream`) rather than `node.data.commands`, because shape sits above scene2d.
- **RegExp:** non-`u` matches that split a surrogate pair cannot be represented as Rust `String` text. Those cases are listed; indices stay exact.
- **bitmapfont `pages`:** the TS codec can produce sparse arrays (holes for unreferenced pages) while declaring `readonly TextureAtlas[]`. Rust uses `Vec<Option<Ref<TextureAtlas>>>` (None = hole). Proposed TS type: `readonly (TextureAtlas | undefined)[]`.
- **materials `modifiers`:** scene3d reads material modifiers through a materials-owned family hook (`modifier_stream`: len + kind_at only) rather than `material.modifiers`, because shading owns the modifier types.
- **type owners:** `Skin` and `Skeleton3D` move from skeleton3d to scene3d (cycle; D8 lowest namer).
- **collision (Phase 3 finding):** the earlier Rust port had algorithm drift (convex-contact normal orientation, sweep support / TOI, capsule manifold, point containment ε, raycast Segment / Point), and its tests were weakened to match (inverted signs, `abs() > .9`). Restored to the pinned TS behavior and expectations (D0).
- **physics2d:** step `dt` and sleep timers are f64 (time accumulation; f32 summation crosses the TS 0.5 s sleep threshold one step early).
- **physics2d swept-impact lifecycle test:** a final `events.ended` assertion expects 1 instead of the TS 0. TS f64 overshoots to x = 4.500000000000001 (contact persists), while f32 lands exactly on 4.5 (touching, rejected by `dist >= radius`). Measured D1 divergence; the other assertions are unchanged.
