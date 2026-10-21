use std::sync::Arc;

use flight_entity::Ref;
use flight_geometry::{create_rectangle, create_vector2};
use flight_node::Node;
use flight_signals::{connect_signal, emit_signal};
use flight_textureatlas::{TextureAtlas, create_texture_atlas};
use flight_tilemap::contract::*;

fn atlas() -> Ref<TextureAtlas> {
    return create_texture_atlas(None);
}

fn tilemap_options() -> PartialTilemap {
    let make: fn() -> PartialTilemap = PartialTilemap::default;
    return make();
}

fn data_options() -> TilemapDataOptions {
    let make: fn() -> TilemapDataOptions = TilemapDataOptions::default;
    return make();
}

mod clear_tilemap {
    use super::*;

    #[test]
    fn fills_all_cells_with_negative_one() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(3),
                rows: Some(2),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        fill_tilemap_tiles(&mut tm.write().unwrap(), 5);
        clear_tilemap(&mut tm.write().unwrap());
        assert_eq!(tm.read().unwrap().data.tiles, vec![-1, -1, -1, -1, -1, -1]);
    }
}

mod clone_tilemap {
    use super::*;

    #[test]
    fn copies_grid_atlas_and_tiles_into_a_new_tilemap() {
        let a = atlas();
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                atlas: Some(a.clone()),
                columns: Some(3),
                rows: Some(2),
                tile_height: Some(16.0),
                tile_width: Some(32.0),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        set_tilemap_tile(&mut tm.write().unwrap(), 1, 1, 9);
        let cloned = clone_tilemap(&tm.read().unwrap());
        assert!(!Arc::ptr_eq(&cloned, &tm));
        let g = cloned.read().unwrap();
        assert_eq!(g.data.columns, 3);
        assert_eq!(g.data.rows, 2);
        assert!(Arc::ptr_eq(g.data.atlas.as_ref().unwrap(), &a));
        assert_eq!(get_tilemap_tile(&g, 1, 1), 9);
        assert_eq!(g.node_fields().kind, TILEMAP_KIND);
    }

    #[test]
    fn clones_the_tiles_buffer_so_mutations_do_not_leak_back() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(2),
                rows: Some(2),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let cloned = clone_tilemap(&tm.read().unwrap());
        set_tilemap_tile(&mut cloned.write().unwrap(), 0, 0, 5);
        assert_eq!(get_tilemap_tile(&tm.read().unwrap(), 0, 0), -1);
    }
}

mod compute_tilemap_local_bounds_rectangle {
    use super::*;

    #[test]
    fn sets_out_dimensions_from_atlas_and_grid_size() {
        let a = atlas();
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                atlas: Some(a),
                columns: Some(5),
                rows: Some(4),
                tile_height: Some(16.0),
                tile_width: Some(32.0),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_tilemap_local_bounds_rectangle(&mut out, &*tm.read().unwrap());
        assert_eq!(out.width, 160.0);
        assert_eq!(out.height, 64.0);
    }

    #[test]
    fn sets_zero_dimensions_when_atlas_is_null() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(5),
                rows: Some(4),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let mut out = create_rectangle(0.0, 0.0, 99.0, 99.0);
        compute_tilemap_local_bounds_rectangle(&mut out, &*tm.read().unwrap());
        assert_eq!(out.width, 0.0);
        assert_eq!(out.height, 0.0);
    }
}

mod create_tilemap {
    use super::*;

    #[test]
    fn initializes_default_values() {
        let tm = create_tilemap(None);
        let g = tm.read().unwrap();
        assert_eq!(g.data.columns, 0);
        assert_eq!(g.data.rows, 0);
        assert!(g.data.atlas.is_none());
        assert!(g.data.tiles.is_empty());
        assert_eq!(g.node_fields().kind, TILEMAP_KIND);
    }

    #[test]
    fn initializes_tiles_to_negative_one() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(3),
                rows: Some(2),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let g = tm.read().unwrap();
        assert_eq!(g.data.tiles.len(), 6);
        assert_eq!(g.data.tiles, vec![-1, -1, -1, -1, -1, -1]);
    }

    #[test]
    fn allows_pre_defined_values() {
        let a = atlas();
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(10),
                rows: Some(5),
                atlas: Some(a.clone()),
                tile_height: Some(16.0),
                tile_width: Some(16.0),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let g = tm.read().unwrap();
        assert_eq!(g.data.columns, 10);
        assert_eq!(g.data.rows, 5);
        assert!(Arc::ptr_eq(g.data.atlas.as_ref().unwrap(), &a));
    }
}

mod create_tilemap_data {
    use super::*;

    #[test]
    fn returns_default_values() {
        let data = create_tilemap_data(None);
        assert_eq!(data.columns, 0);
        assert_eq!(data.rows, 0);
        assert!(data.atlas.is_none());
        assert!(data.tiles.is_empty());
    }

    #[test]
    fn fills_tiles_with_negative_one() {
        let data = create_tilemap_data(Some(&TilemapDataOptions {
            columns: Some(2),
            rows: Some(3),
            ..data_options()
        }));
        assert_eq!(data.tiles, vec![-1, -1, -1, -1, -1, -1]);
    }
}

mod create_tilemap_runtime {
    use super::*;

    #[test]
    fn returns_a_non_null_runtime() {
        let runtime = create_tilemap_runtime();
        let _ = &runtime;
    }
}

mod create_tilemap_signals {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn creates_a_signals_group_with_the_three_tilemap_signals() {
        let signals = create_tilemap_signals();
        let cleared = Arc::new(Mutex::new(false));
        let tile_args = Arc::new(Mutex::new(Vec::<i32>::new()));
        {
            let cleared = cleared.clone();
            connect_signal(
                &signals.on_cleared,
                Arc::new(move |_: &()| {
                    *cleared.lock().unwrap() = true;
                }),
                None,
            );
        }
        {
            let tile_args = tile_args.clone();
            connect_signal(
                &signals.on_tile_changed,
                Arc::new(move |args: &(i32, i32, i16)| {
                    *tile_args.lock().unwrap() = vec![args.0, args.1, args.2 as i32];
                }),
                None,
            );
        }
        emit_signal(&signals.on_cleared, &());
        emit_signal(&signals.on_tile_changed, &(1, 2, 3));
        assert!(*cleared.lock().unwrap());
        assert_eq!(*tile_args.lock().unwrap(), vec![1, 2, 3]);
    }
}

mod enable_tilemap_signals {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn creates_and_attaches_signals_on_first_call() {
        let tm = create_tilemap(None);
        assert!(get_tilemap_signals(&tm.read().unwrap()).is_none());
        enable_tilemap_signals(&mut tm.write().unwrap());
        assert!(get_tilemap_signals(&tm.read().unwrap()).is_some());
    }

    #[test]
    fn makes_set_tilemap_tile_fire_on_tile_changed() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(3),
                rows: Some(3),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let received = Arc::new(Mutex::new(Vec::<i32>::new()));
        {
            let mut g = tm.write().unwrap();
            let signals = enable_tilemap_signals(&mut g);
            let received = received.clone();
            connect_signal(
                &signals.on_tile_changed,
                Arc::new(move |args: &(i32, i32, i16)| {
                    *received.lock().unwrap() = vec![args.0, args.1, args.2 as i32];
                }),
                None,
            );
        }
        set_tilemap_tile(&mut tm.write().unwrap(), 1, 2, 4);
        assert_eq!(*received.lock().unwrap(), vec![1, 2, 4]);
    }

    #[test]
    fn makes_clear_tilemap_fire_on_cleared() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(2),
                rows: Some(2),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let cleared = Arc::new(Mutex::new(false));
        {
            let mut g = tm.write().unwrap();
            let signals = enable_tilemap_signals(&mut g);
            let cleared = cleared.clone();
            connect_signal(
                &signals.on_cleared,
                Arc::new(move |_: &()| {
                    *cleared.lock().unwrap() = true;
                }),
                None,
            );
        }
        clear_tilemap(&mut tm.write().unwrap());
        assert!(*cleared.lock().unwrap());
    }
}

mod fill_tilemap_tiles {
    use super::*;

    #[test]
    fn fills_all_cells_with_the_given_id() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(2),
                rows: Some(2),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        fill_tilemap_tiles(&mut tm.write().unwrap(), 3);
        assert_eq!(tm.read().unwrap().data.tiles, vec![3, 3, 3, 3]);
    }

    #[test]
    fn clears_all_tiles_with_negative_one() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(2),
                rows: Some(2),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        fill_tilemap_tiles(&mut tm.write().unwrap(), 5);
        fill_tilemap_tiles(&mut tm.write().unwrap(), -1);
        assert_eq!(tm.read().unwrap().data.tiles, vec![-1, -1, -1, -1]);
    }
}

mod get_tilemap_column_at_x {
    use super::*;

    #[test]
    fn returns_negative_one_when_atlas_is_null() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(4),
                rows: Some(4),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        assert_eq!(get_tilemap_column_at_x(&tm.read().unwrap(), 10.0), -1);
    }

    #[test]
    fn returns_the_floored_column_for_an_in_bounds_x() {
        let a = atlas();
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                atlas: Some(a),
                columns: Some(4),
                rows: Some(4),
                tile_height: Some(16.0),
                tile_width: Some(16.0),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let g = tm.read().unwrap();
        assert_eq!(get_tilemap_column_at_x(&g, 0.0), 0);
        assert_eq!(get_tilemap_column_at_x(&g, 31.0), 1);
        assert_eq!(get_tilemap_column_at_x(&g, 48.0), 3);
    }

    #[test]
    fn returns_negative_one_for_x_outside_the_grid() {
        let a = atlas();
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                atlas: Some(a),
                columns: Some(4),
                rows: Some(4),
                tile_height: Some(16.0),
                tile_width: Some(16.0),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let g = tm.read().unwrap();
        assert_eq!(get_tilemap_column_at_x(&g, -1.0), -1);
        assert_eq!(get_tilemap_column_at_x(&g, 64.0), -1);
    }
}

mod get_tilemap_column_row_at_point {
    use super::*;

    #[test]
    fn writes_column_and_row_for_an_in_bounds_point() {
        let a = atlas();
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                atlas: Some(a),
                columns: Some(4),
                rows: Some(4),
                tile_height: Some(16.0),
                tile_width: Some(16.0),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let mut out = create_vector2(99.0, 99.0);
        let g = tm.read().unwrap();
        assert!(get_tilemap_column_row_at_point(&mut out, &g, 33.0, 17.0));
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 1.0);
    }

    #[test]
    fn returns_false_and_does_not_modify_out_for_out_of_bounds() {
        let a = atlas();
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                atlas: Some(a),
                columns: Some(4),
                rows: Some(4),
                tile_height: Some(16.0),
                tile_width: Some(16.0),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let mut out = create_vector2(7.0, 8.0);
        let g = tm.read().unwrap();
        assert!(!get_tilemap_column_row_at_point(&mut out, &g, -1.0, 0.0));
        assert_eq!(out.x, 7.0);
        assert_eq!(out.y, 8.0);
    }
}

mod get_tilemap_row_at_y {
    use super::*;

    #[test]
    fn returns_negative_one_when_atlas_is_null() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(4),
                rows: Some(4),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        assert_eq!(get_tilemap_row_at_y(&tm.read().unwrap(), 10.0), -1);
    }

    #[test]
    fn returns_the_floored_row_for_an_in_bounds_y() {
        let a = atlas();
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                atlas: Some(a),
                columns: Some(4),
                rows: Some(4),
                tile_height: Some(16.0),
                tile_width: Some(16.0),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let g = tm.read().unwrap();
        assert_eq!(get_tilemap_row_at_y(&g, 0.0), 0);
        assert_eq!(get_tilemap_row_at_y(&g, 31.0), 1);
    }

    #[test]
    fn returns_negative_one_for_y_outside_the_grid() {
        let a = atlas();
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                atlas: Some(a),
                columns: Some(4),
                rows: Some(4),
                tile_height: Some(16.0),
                tile_width: Some(16.0),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let g = tm.read().unwrap();
        assert_eq!(get_tilemap_row_at_y(&g, -1.0), -1);
        assert_eq!(get_tilemap_row_at_y(&g, 64.0), -1);
    }
}

mod get_tilemap_runtime {
    use super::*;

    #[test]
    fn returns_the_runtime_for_a_tilemap() {
        let tm = create_tilemap(None);
        let g = tm.read().unwrap();
        let _runtime = get_tilemap_runtime(&g);
    }
}

mod get_tilemap_signals {
    use super::*;

    #[test]
    fn returns_none_before_signals_are_enabled() {
        let tm = create_tilemap(None);
        assert!(get_tilemap_signals(&tm.read().unwrap()).is_none());
    }

    #[test]
    fn returns_some_after_enabling() {
        let tm = create_tilemap(None);
        enable_tilemap_signals(&mut tm.write().unwrap());
        assert!(get_tilemap_signals(&tm.read().unwrap()).is_some());
    }
}

mod get_tilemap_tile {
    use super::*;

    #[test]
    fn returns_negative_one_for_out_of_bounds_coordinates() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(3),
                rows: Some(3),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let g = tm.read().unwrap();
        assert_eq!(get_tilemap_tile(&g, -1, 0), -1);
        assert_eq!(get_tilemap_tile(&g, 3, 0), -1);
        assert_eq!(get_tilemap_tile(&g, 0, -1), -1);
        assert_eq!(get_tilemap_tile(&g, 0, 3), -1);
    }

    #[test]
    fn returns_negative_one_for_empty_cells() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(2),
                rows: Some(2),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        assert_eq!(get_tilemap_tile(&tm.read().unwrap(), 0, 0), -1);
    }

    #[test]
    fn reads_back_what_set_tilemap_tile_wrote() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(4),
                rows: Some(4),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        set_tilemap_tile(&mut tm.write().unwrap(), 2, 1, 7);
        assert_eq!(get_tilemap_tile(&tm.read().unwrap(), 2, 1), 7);
    }
}

mod get_tilemap_tile_at_point {
    use super::*;

    #[test]
    fn returns_the_cell_value_at_a_local_space_point() {
        let a = atlas();
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                atlas: Some(a),
                columns: Some(4),
                rows: Some(4),
                tile_height: Some(16.0),
                tile_width: Some(16.0),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        set_tilemap_tile(&mut tm.write().unwrap(), 2, 1, 8);
        let g = tm.read().unwrap();
        assert_eq!(
            get_tilemap_tile_at_point(&g, &create_vector2(33.0, 17.0)),
            8
        );
    }

    #[test]
    fn returns_negative_one_for_an_out_of_bounds_point() {
        let a = atlas();
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                atlas: Some(a),
                columns: Some(4),
                rows: Some(4),
                tile_height: Some(16.0),
                tile_width: Some(16.0),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let g = tm.read().unwrap();
        assert_eq!(
            get_tilemap_tile_at_point(&g, &create_vector2(-5.0, 0.0)),
            -1
        );
    }
}

mod get_tilemap_tile_at_point_xy {
    use super::*;

    #[test]
    fn returns_the_cell_value_at_xy() {
        let a = atlas();
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                atlas: Some(a),
                columns: Some(4),
                rows: Some(4),
                tile_height: Some(16.0),
                tile_width: Some(16.0),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        set_tilemap_tile(&mut tm.write().unwrap(), 0, 0, 3);
        assert_eq!(
            get_tilemap_tile_at_point_xy(&tm.read().unwrap(), 5.0, 5.0),
            3
        );
    }

    #[test]
    fn returns_negative_one_when_atlas_is_null() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(4),
                rows: Some(4),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        assert_eq!(
            get_tilemap_tile_at_point_xy(&tm.read().unwrap(), 5.0, 5.0),
            -1
        );
    }
}

mod get_tilemap_tile_rect {
    use super::*;

    #[test]
    fn writes_the_cell_rectangle_for_an_in_bounds_cell() {
        let a = atlas();
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                atlas: Some(a),
                columns: Some(4),
                rows: Some(4),
                tile_height: Some(24.0),
                tile_width: Some(16.0),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        let g = tm.read().unwrap();
        assert!(get_tilemap_tile_rect(&mut out, &g, 2, 1));
        assert_eq!(out.x, 32.0);
        assert_eq!(out.y, 24.0);
        assert_eq!(out.width, 16.0);
        assert_eq!(out.height, 24.0);
    }

    #[test]
    fn returns_false_and_does_not_modify_out_for_out_of_bounds() {
        let a = atlas();
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                atlas: Some(a),
                columns: Some(4),
                rows: Some(4),
                tile_height: Some(16.0),
                tile_width: Some(16.0),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let mut out = create_rectangle(1.0, 2.0, 3.0, 4.0);
        let g = tm.read().unwrap();
        assert!(!get_tilemap_tile_rect(&mut out, &g, 5, 0));
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
        assert_eq!(out.width, 3.0);
        assert_eq!(out.height, 4.0);
    }

    #[test]
    fn returns_false_when_atlas_is_null() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(4),
                rows: Some(4),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        assert!(!get_tilemap_tile_rect(
            &mut out,
            &tm.read().unwrap(),
            0,
            0
        ));
    }
}

mod initialize_tilemap_data {
    use super::*;

    #[test]
    fn initializes_columns_and_rows_from_options() {
        let mut out = create_tilemap_data(None);
        initialize_tilemap_data(
            &mut out,
            Some(&TilemapDataOptions {
                columns: Some(5),
                rows: Some(3),
                ..data_options()
            }),
        );
        assert_eq!(out.columns, 5);
        assert_eq!(out.rows, 3);
        assert_eq!(out.tiles.len(), 15);
    }
}

mod initialize_tilemap_signals {
    use super::*;

    #[test]
    fn reinitializes_signal_fields() {
        let mut signals = create_tilemap_signals();
        initialize_tilemap_signals(&mut signals);
        emit_signal(&signals.on_cleared, &());
    }
}

mod resize_tilemap {
    use super::*;

    #[test]
    fn updates_columns_and_rows() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(3),
                rows: Some(3),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        resize_tilemap(&mut tm.write().unwrap(), 5, 4);
        let g = tm.read().unwrap();
        assert_eq!(g.data.columns, 5);
        assert_eq!(g.data.rows, 4);
    }

    #[test]
    fn copies_surviving_cells_when_shrinking() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(3),
                rows: Some(3),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        set_tilemap_tile(&mut tm.write().unwrap(), 0, 0, 1);
        set_tilemap_tile(&mut tm.write().unwrap(), 1, 1, 2);
        resize_tilemap(&mut tm.write().unwrap(), 2, 2);
        let g = tm.read().unwrap();
        assert_eq!(get_tilemap_tile(&g, 0, 0), 1);
        assert_eq!(get_tilemap_tile(&g, 1, 1), 2);
    }

    #[test]
    fn fills_new_cells_with_negative_one_when_growing() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(2),
                rows: Some(2),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        set_tilemap_tile(&mut tm.write().unwrap(), 0, 0, 5);
        resize_tilemap(&mut tm.write().unwrap(), 4, 4);
        let g = tm.read().unwrap();
        assert_eq!(get_tilemap_tile(&g, 0, 0), 5);
        assert_eq!(get_tilemap_tile(&g, 3, 3), -1);
    }

    #[test]
    fn correctly_re_indexes_tiles_after_resize() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(3),
                rows: Some(2),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        set_tilemap_tile(&mut tm.write().unwrap(), 2, 1, 9);
        resize_tilemap(&mut tm.write().unwrap(), 4, 3);
        assert_eq!(get_tilemap_tile(&tm.read().unwrap(), 2, 1), 9);
    }
}

mod set_tilemap_tile {
    use super::*;

    #[test]
    fn stores_tiles_in_row_major_order() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(3),
                rows: Some(3),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        set_tilemap_tile(&mut tm.write().unwrap(), 1, 0, 42);
        assert_eq!(tm.read().unwrap().data.tiles[1], 42);
    }

    #[test]
    fn silently_ignores_out_of_bounds_writes() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(2),
                rows: Some(2),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        set_tilemap_tile(&mut tm.write().unwrap(), -1, 0, 5);
        set_tilemap_tile(&mut tm.write().unwrap(), 2, 0, 5);
        set_tilemap_tile(&mut tm.write().unwrap(), 0, -1, 5);
        set_tilemap_tile(&mut tm.write().unwrap(), 0, 2, 5);
        assert_eq!(tm.read().unwrap().data.tiles, vec![-1, -1, -1, -1]);
    }

    #[test]
    fn can_set_the_empty_sentinel() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(2),
                rows: Some(2),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        set_tilemap_tile(&mut tm.write().unwrap(), 0, 0, 3);
        set_tilemap_tile(&mut tm.write().unwrap(), 0, 0, -1);
        assert_eq!(get_tilemap_tile(&tm.read().unwrap(), 0, 0), -1);
    }
}

mod set_tilemap_tile_tint {
    use super::*;

    #[test]
    fn lazily_allocates_per_tile_data_and_stores_packed_rgba() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(3),
                rows: Some(2),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        assert!(tm.read().unwrap().data.material_data.is_none());
        set_tilemap_tile_tint(&mut tm.write().unwrap(), 1, 1, 0x12345678);
        let g = tm.read().unwrap();
        let material_data = g.data.material_data.as_ref().unwrap();
        assert_eq!(material_data.len(), 6);
        assert!(material_data[4].is_some());
    }

    #[test]
    fn ignores_out_of_range_coordinates_without_allocating() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(1),
                rows: Some(1),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        set_tilemap_tile_tint(&mut tm.write().unwrap(), 1, 0, 0xffffffff);
        assert!(tm.read().unwrap().data.material_data.is_none());
    }
}

mod set_tilemap_tiles {
    use super::*;

    #[test]
    fn blits_a_sub_grid_at_offset_zero() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(4),
                rows: Some(3),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let ids: Vec<i16> = vec![1, 2, 3, 4, 5, 6];
        set_tilemap_tiles(&mut tm.write().unwrap(), &ids, 0, 0, 3, 2);
        let g = tm.read().unwrap();
        assert_eq!(get_tilemap_tile(&g, 0, 0), 1);
        assert_eq!(get_tilemap_tile(&g, 1, 0), 2);
        assert_eq!(get_tilemap_tile(&g, 2, 0), 3);
        assert_eq!(get_tilemap_tile(&g, 0, 1), 4);
        assert_eq!(get_tilemap_tile(&g, 1, 1), 5);
        assert_eq!(get_tilemap_tile(&g, 2, 1), 6);
        assert_eq!(get_tilemap_tile(&g, 3, 0), -1);
    }

    #[test]
    fn blits_at_a_non_zero_offset() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(4),
                rows: Some(4),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let ids: Vec<i16> = vec![10, 11, 12, 13];
        set_tilemap_tiles(&mut tm.write().unwrap(), &ids, 1, 2, 2, 2);
        let g = tm.read().unwrap();
        assert_eq!(get_tilemap_tile(&g, 1, 2), 10);
        assert_eq!(get_tilemap_tile(&g, 2, 2), 11);
        assert_eq!(get_tilemap_tile(&g, 1, 3), 12);
        assert_eq!(get_tilemap_tile(&g, 2, 3), 13);
        assert_eq!(get_tilemap_tile(&g, 0, 0), -1);
    }

    #[test]
    fn clips_writes_that_extend_outside_the_tilemap() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(2),
                rows: Some(2),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let ids: Vec<i16> = vec![1, 2, 3, 4, 5, 6, 7, 8, 9];
        set_tilemap_tiles(&mut tm.write().unwrap(), &ids, 1, 1, 3, 3);
        let g = tm.read().unwrap();
        assert_eq!(get_tilemap_tile(&g, 1, 1), 1);
        assert_eq!(get_tilemap_tile(&g, 0, 0), -1);
        assert_eq!(get_tilemap_tile(&g, 1, 0), -1);
    }

    #[test]
    fn handles_negative_offsets_by_clipping() {
        let tm = create_tilemap(Some(&PartialTilemap {
            data: Some(TilemapDataOptions {
                columns: Some(3),
                rows: Some(3),
                ..data_options()
            }),
            ..tilemap_options()
        }));
        let ids: Vec<i16> = vec![10, 20, 30, 40, 50, 60, 70, 80, 90];
        set_tilemap_tiles(&mut tm.write().unwrap(), &ids, -1, -1, 3, 3);
        let g = tm.read().unwrap();
        assert_eq!(get_tilemap_tile(&g, 0, 0), 50);
        assert_eq!(get_tilemap_tile(&g, 1, 0), 60);
        assert_eq!(get_tilemap_tile(&g, 0, 1), 80);
        assert_eq!(get_tilemap_tile(&g, 1, 1), 90);
    }
}
