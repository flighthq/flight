use std::collections::HashMap;

use flight_spatial::*;
use flight_spatial::contract::{UniformGrid2D, initialize_uniform_grid_spatial_backend_2d};

fn pair_keys(pairs: &[SpatialPair]) -> Vec<String> {
    let mut keys: Vec<String> = pairs
        .iter()
        .map(|p| {
            let a = p.a.min(p.b);
            let b = p.a.max(p.b);
            format!("{}-{}", a, b)
        })
        .collect();
    keys.sort();
    return keys;
}

fn sorted_ids(ids: &[SpatialObjectId]) -> Vec<SpatialObjectId> {
    let mut v: Vec<SpatialObjectId> = ids.to_vec();
    v.sort();
    return v;
}

fn bounds_overlap(a: &SpatialAabb2D, b: &SpatialAabb2D) -> bool {
    return a.min_x < b.max_x && a.max_x > b.min_x && a.min_y < b.max_y && a.max_y > b.min_y;
}

fn bounds_contain_point(bounds: &SpatialAabb2D, x: f32, y: f32) -> bool {
    return x >= bounds.min_x && x <= bounds.max_x && y >= bounds.min_y && y <= bounds.max_y;
}

fn bounds_intersect_ray(bounds: &SpatialAabb2D, ox: f32, oy: f32, dx: f32, dy: f32) -> bool {
    let mut t_min = f32::NEG_INFINITY;
    let mut t_max = f32::INFINITY;
    if dx == 0.0 {
        if ox < bounds.min_x || ox > bounds.max_x {
            return false;
        }
    } else {
        let tx0 = (bounds.min_x - ox) / dx;
        let tx1 = (bounds.max_x - ox) / dx;
        t_min = t_min.max(tx0.min(tx1));
        t_max = t_max.min(tx0.max(tx1));
    }
    if dy == 0.0 {
        if oy < bounds.min_y || oy > bounds.max_y {
            return false;
        }
    } else {
        let ty0 = (bounds.min_y - oy) / dy;
        let ty1 = (bounds.max_y - oy) / dy;
        t_min = t_min.max(ty0.min(ty1));
        t_max = t_max.min(ty0.max(ty1));
    }
    return t_max >= t_min && t_max >= 0.0;
}

fn bounds_share_cell(a: &SpatialAabb2D, b: &SpatialAabb2D, cell_size: f32) -> bool {
    return (a.min_x / cell_size).floor().max((b.min_x / cell_size).floor())
        <= (a.max_x / cell_size).floor().min((b.max_x / cell_size).floor())
        && (a.min_y / cell_size).floor().max((b.min_y / cell_size).floor())
            <= (a.max_y / cell_size).floor().min((b.max_y / cell_size).floor());
}

fn is_overflow_bounds(bounds: &SpatialAabb2D, cell_size: f32) -> bool {
    let width = (bounds.max_x / cell_size).floor() as i64 - (bounds.min_x / cell_size).floor() as i64 + 1;
    let height = (bounds.max_y / cell_size).floor() as i64 - (bounds.min_y / cell_size).floor() as i64 + 1;
    return width * height > MAX_INDEXED_CELLS_PER_OBJECT as i64;
}

fn create_test_random(seed: u32) -> impl FnMut() -> f32 {
    let mut state = seed;
    return move || {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        return state as f32 / 0x1_0000_0000_u64 as f32;
    };
}

fn brute_force_pair_keys(
    objects: &HashMap<SpatialObjectId, SpatialAabb2D>,
    cell_size: f32,
) -> Vec<String> {
    let entries: Vec<_> = objects.iter().collect();
    let mut pairs: Vec<String> = Vec::new();
    for i in 0..entries.len() {
        for j in (i + 1)..entries.len() {
            let (&a_id, a) = entries[i];
            let (&b_id, b) = entries[j];
            let matches = if is_overflow_bounds(a, cell_size) || is_overflow_bounds(b, cell_size) {
                bounds_overlap(a, b)
            } else {
                bounds_share_cell(a, b, cell_size)
            };
            if matches {
                let lo = a_id.min(b_id);
                let hi = a_id.max(b_id);
                pairs.push(format!("{}-{}", lo, hi));
            }
        }
    }
    pairs.sort();
    return pairs;
}

mod brute_force_property_coverage {
    use super::*;

    #[test]
    fn matches_pair_region_point_and_ray_oracles_through_seeded_churn() {
        let cell_size: f32 = 4.0;
        for &seed in &[0x1357_9bdf_u32, 0x2468_ace0, 0x5eed_f00d, 0xc0ff_ee42] {
            let mut random = create_test_random(seed);
            let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(cell_size)));
            let mut objects: HashMap<SpatialObjectId, SpatialAabb2D> = HashMap::new();

            let random_bounds = |random: &mut dyn FnMut() -> f32, overflow: bool| -> SpatialAabb2D {
                let min_x = (random() * 160.0).floor() - 80.0 + random();
                let min_y = (random() * 160.0).floor() - 80.0 + random();
                let width = if overflow {
                    cell_size * (34.0 + (random() * 12.0).floor())
                } else {
                    0.25 + random() * 12.0
                };
                let height = if overflow {
                    cell_size * (34.0 + (random() * 12.0).floor())
                } else {
                    0.25 + random() * 12.0
                };
                return SpatialAabb2D { min_x, min_y, max_x: min_x + width, max_y: min_y + height };
            };

            let ordinary = random_bounds(&mut random, false);
            objects.insert(0, ordinary);
            insert_spatial_object_2d(&mut grid, 0, &ordinary);

            // Verify pairs
            let pairs = query_spatial_pairs_2d(&mut grid);
            assert_eq!(pair_keys(&pairs), brute_force_pair_keys(&objects, cell_size));

            let overflow = random_bounds(&mut random, true);
            objects.insert(0, overflow);
            update_spatial_object_2d(&mut grid, 0, &overflow);
            assert_eq!(
                explain_spatial_indexing_2d(&grid, 0).mode,
                SpatialIndexingMode::Overflow
            );

            let ordinary_again = random_bounds(&mut random, false);
            objects.insert(0, ordinary_again);
            update_spatial_object_2d(&mut grid, 0, &ordinary_again);
            assert_eq!(
                explain_spatial_indexing_2d(&grid, 0).mode,
                SpatialIndexingMode::Cells
            );

            for _step in 0..100 {
                let id = (random() * 18.0).floor() as SpatialObjectId;
                let action_roll = random();
                if action_roll < 0.72 {
                    let overflow_roll = random() < 0.22;
                    let bounds = random_bounds(&mut random, overflow_roll);
                    if objects.contains_key(&id) {
                        update_spatial_object_2d(&mut grid, id, &bounds);
                    } else {
                        let insert_roll = random();
                        if insert_roll < 0.5 {
                            insert_spatial_object_2d(&mut grid, id, &bounds);
                        } else {
                            update_spatial_object_2d(&mut grid, id, &bounds);
                        }
                    }
                    objects.insert(id, bounds);
                } else {
                    remove_spatial_object_2d(&mut grid, id);
                    objects.remove(&id);
                }

                let pairs = query_spatial_pairs_2d(&mut grid);
                assert_eq!(pair_keys(&pairs), brute_force_pair_keys(&objects, cell_size));

                // Region oracle
                let region_min_x = random() * 240.0 - 120.0;
                let region_min_y = random() * 240.0 - 120.0;
                let region = SpatialAabb2D { min_x: region_min_x, min_y: region_min_y, max_x: region_min_x + 1.0 + random() * 80.0, max_y: region_min_y + 1.0 + random() * 80.0 };
                let mut region_actual: Vec<SpatialObjectId> = Vec::new();
                query_spatial_region_2d(&mut region_actual, &mut grid, &region);
                let mut region_expected: Vec<SpatialObjectId> = objects
                    .iter()
                    .filter(|(_, bounds)| bounds_overlap(bounds, &region))
                    .map(|(&id, _)| id)
                    .collect();
                region_expected.sort();
                assert_eq!(sorted_ids(&region_actual), region_expected);

                // Point oracle
                let point_x = random() * 320.0 - 160.0;
                let point_y = random() * 320.0 - 160.0;
                let mut point_actual: Vec<SpatialObjectId> = Vec::new();
                query_spatial_point_2d(&mut point_actual, &mut grid, point_x, point_y);
                let mut point_expected: Vec<SpatialObjectId> = objects
                    .iter()
                    .filter(|(_, bounds)| bounds_contain_point(bounds, point_x, point_y))
                    .map(|(&id, _)| id)
                    .collect();
                point_expected.sort();
                assert_eq!(sorted_ids(&point_actual), point_expected);

                // Ray oracle
                let ray_x = random() * 400.0 - 200.0;
                let ray_y = random() * 400.0 - 200.0;
                let mut ray_dx = random() * 2.0 - 1.0;
                let mut ray_dy = random() * 2.0 - 1.0;
                if random() < 0.1 {
                    ray_dx = 0.0;
                }
                if random() < 0.1 {
                    ray_dy = 0.0;
                }
                let mut ray_actual: Vec<SpatialObjectId> = Vec::new();
                query_spatial_ray_2d(&mut ray_actual, &mut grid, ray_x, ray_y, ray_dx, ray_dy);
                let mut ray_expected: Vec<SpatialObjectId> = objects
                    .iter()
                    .filter(|(_, bounds)| bounds_intersect_ray(bounds, ray_x, ray_y, ray_dx, ray_dy))
                    .map(|(&id, _)| id)
                    .collect();
                ray_expected.sort();
                assert_eq!(sorted_ids(&ray_actual), ray_expected);
            }
        }
    }
}

mod cell_range_across_every_transition {
    use super::*;

    const FAR: f32 = 5_000_000.0;

    fn ray_ids(grid: &mut SpatialIndex2D) -> Vec<SpatialObjectId> {
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_2d(&mut out, grid, -5.0, 0.5, 1.0, 0.0);
        out.sort();
        return out;
    }

    fn grid_with_wide_range() -> SpatialIndex2D {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 1.0, max_y: 1.0 });
        insert_spatial_object_2d(&mut grid, 2, &SpatialAabb2D { min_x: FAR, min_y: 0.0, max_x: FAR + 1.0, max_y: 1.0 });
        return grid;
    }

    #[test]
    fn seeds_the_range_on_first_insert_and_widens_on_next() {
        let mut grid = grid_with_wide_range();
        assert_eq!(ray_ids(&mut grid), vec![1, 2]);
    }

    #[test]
    fn removes_last_celled_object_while_overflowed_remains() {
        let mut grid = grid_with_wide_range();
        insert_spatial_object_2d(&mut grid, 3, &SpatialAabb2D { min_x: -1e12, min_y: -1e12, max_x: 1e12, max_y: 1e12 });
        remove_spatial_object_2d(&mut grid, 1);
        remove_spatial_object_2d(&mut grid, 2);
        assert_eq!(ray_ids(&mut grid), vec![3]);
    }

    #[test]
    fn removes_last_celled_object_while_declined_remains() {
        let mut grid = grid_with_wide_range();
        insert_spatial_object_2d(&mut grid, 3, &SpatialAabb2D { min_x: f32::NAN, min_y: 0.0, max_x: 1.0, max_y: 1.0 });
        remove_spatial_object_2d(&mut grid, 1);
        remove_spatial_object_2d(&mut grid, 2);
        assert_eq!(ray_ids(&mut grid), Vec::<SpatialObjectId>::new());
    }

    #[test]
    fn removes_last_celled_object_with_nothing_else() {
        let mut grid = grid_with_wide_range();
        remove_spatial_object_2d(&mut grid, 1);
        remove_spatial_object_2d(&mut grid, 2);
        assert_eq!(ray_ids(&mut grid), Vec::<SpatialObjectId>::new());
    }

    #[test]
    fn removes_overflowed_while_celled_remain() {
        let mut grid = grid_with_wide_range();
        insert_spatial_object_2d(&mut grid, 3, &SpatialAabb2D { min_x: -1e12, min_y: -1e12, max_x: 1e12, max_y: 1e12 });
        remove_spatial_object_2d(&mut grid, 3);
        assert_eq!(ray_ids(&mut grid), vec![1, 2]);
    }

    #[test]
    fn updates_last_celled_into_overflow_emptying_cells() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 1.0, max_y: 1.0 });
        insert_spatial_object_2d(&mut grid, 2, &SpatialAabb2D { min_x: FAR, min_y: 0.0, max_x: FAR + 1.0, max_y: 1.0 });
        update_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: -1e12, min_y: -1e12, max_x: 1e12, max_y: 1e12 });
        update_spatial_object_2d(&mut grid, 2, &SpatialAabb2D { min_x: -1e12, min_y: -1e12, max_x: 1e12, max_y: 1e12 });
        assert_eq!(ray_ids(&mut grid), vec![1, 2]);
    }

    #[test]
    fn updates_overflowed_back_into_cells_reseeding() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 1.0, max_y: 1.0 });
        insert_spatial_object_2d(&mut grid, 2, &SpatialAabb2D { min_x: FAR, min_y: 0.0, max_x: FAR + 1.0, max_y: 1.0 });
        update_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: -1e12, min_y: -1e12, max_x: 1e12, max_y: 1e12 });
        update_spatial_object_2d(&mut grid, 2, &SpatialAabb2D { min_x: -1e12, min_y: -1e12, max_x: 1e12, max_y: 1e12 });
        update_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 1.0, max_y: 1.0 });
        assert_eq!(ray_ids(&mut grid), vec![1, 2]);
    }

    #[test]
    fn clears_while_overflowed_present() {
        let mut grid = grid_with_wide_range();
        insert_spatial_object_2d(&mut grid, 3, &SpatialAabb2D { min_x: -1e12, min_y: -1e12, max_x: 1e12, max_y: 1e12 });
        clear_spatial_index_2d(&mut grid);
        assert_eq!(ray_ids(&mut grid), Vec::<SpatialObjectId>::new());
    }

    #[test]
    fn reseeds_tight_range_after_empty_and_refill() {
        let mut grid = grid_with_wide_range();
        clear_spatial_index_2d(&mut grid);
        insert_spatial_object_2d(&mut grid, 9, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 1.0, max_y: 1.0 });
        assert_eq!(ray_ids(&mut grid), vec![9]);
    }

    #[test]
    fn keeps_region_and_point_correct_across_overflow_transition() {
        let mut grid = grid_with_wide_range();
        insert_spatial_object_2d(&mut grid, 3, &SpatialAabb2D { min_x: -1e12, min_y: -1e12, max_x: 1e12, max_y: 1e12 });
        remove_spatial_object_2d(&mut grid, 1);
        remove_spatial_object_2d(&mut grid, 2);
        let mut region: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut region, &mut grid, &SpatialAabb2D { min_x: -1.0, min_y: -1.0, max_x: 2.0, max_y: 2.0 });
        assert_eq!(region, vec![3]);
        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut point, &mut grid, 0.5, 0.5);
        assert_eq!(point, vec![3]);
    }
}

mod create_uniform_grid_spatial_backend_2d {
    use super::*;

    #[test]
    fn returns_an_entity() {
        let mut backend=create_uniform_grid_spatial_backend_2d(10.0);
        assert!(!flight_entity::has_entity_runtime(&backend));
        flight_entity::set_entity_uid(&mut backend,"grid2d".to_owned());
        assert!(flight_entity::has_entity_runtime(&backend));
        assert_eq!(flight_entity::get_entity_uid(&mut backend),"grid2d");
    }

    #[test]
    fn emits_pair_spanning_several_shared_cells_exactly_once() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 25.0, max_y: 25.0 });
        insert_spatial_object_2d(&mut grid, 2, &SpatialAabb2D { min_x: 5.0, min_y: 5.0, max_x: 29.0, max_y: 29.0 });
        let pairs = query_spatial_pairs_2d(&mut grid);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pair_keys(&pairs), vec!["1-2"]);
    }

    #[test]
    fn never_pairs_an_object_with_itself() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 4.0, max_y: 4.0 });
        let pairs = query_spatial_pairs_2d(&mut grid);
        assert_eq!(pairs.len(), 0);
    }

    #[test]
    fn returns_nothing_from_every_query_on_empty_grid() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        let pairs = query_spatial_pairs_2d(&mut grid);
        assert_eq!(pairs.len(), 0);

        let mut region: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut region, &mut grid, &SpatialAabb2D { min_x: -50.0, min_y: -50.0, max_x: 50.0, max_y: 50.0 });
        assert_eq!(region.len(), 0);

        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut point, &mut grid, 0.0, 0.0);
        assert_eq!(point.len(), 0);

        let mut ray: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_2d(&mut ray, &mut grid, 0.0, 0.0, 1.0, 1.0);
        assert_eq!(ray.len(), 0);
    }

    #[test]
    fn indexes_objects_at_negative_coordinates() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: -8.0, min_y: -8.0, max_x: -4.0, max_y: -4.0 });
        insert_spatial_object_2d(&mut grid, 2, &SpatialAabb2D { min_x: -6.0, min_y: -6.0, max_x: -2.0, max_y: -2.0 });
        let pairs = query_spatial_pairs_2d(&mut grid);
        assert_eq!(pair_keys(&pairs), vec!["1-2"]);

        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut point, &mut grid, -5.0, -5.0);
        assert_eq!(sorted_ids(&point), vec![1, 2]);
    }

    #[test]
    fn gives_the_same_confirmed_pairs_across_cell_sizes() {
        let objects: Vec<(SpatialObjectId, SpatialAabb2D)> = vec![
            (1, SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 10.0, max_y: 10.0 }),
            (2, SpatialAabb2D { min_x: 5.0, min_y: 5.0, max_x: 15.0, max_y: 15.0 }),
            (3, SpatialAabb2D { min_x: 12.0, min_y: 12.0, max_x: 20.0, max_y: 20.0 }),
            (4, SpatialAabb2D { min_x: 100.0, min_y: 100.0, max_x: 110.0, max_y: 110.0 }),
        ];

        let confirmed_pairs = |cell_size: f32| -> Vec<String> {
            let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(cell_size)));
            for &(id, ref bounds) in &objects {
                insert_spatial_object_2d(&mut grid, id, bounds);
            }
            let candidates = query_spatial_pairs_2d(&mut grid);
            let confirmed: Vec<SpatialPair> = candidates
                .iter()
                .filter(|p| {
                    let ab = objects.iter().find(|(id, _)| *id == p.a).unwrap().1;
                    let bb = objects.iter().find(|(id, _)| *id == p.b).unwrap().1;
                    bounds_overlap(&ab, &bb)
                })
                .copied()
                .collect();
            return pair_keys(&confirmed);
        };

        let fine = confirmed_pairs(10.0);
        let coarse = confirmed_pairs(64.0);
        assert_eq!(fine, vec!["1-2", "2-3"]);
        assert_eq!(coarse, fine);
    }
}

mod initialize_uniform_grid_spatial_backend_2d {
    use super::*;

    #[test]
    fn is_the_construction_initializer() {
        let mut backend = create_uniform_grid_spatial_backend_2d(1.0);
        initialize_uniform_grid_spatial_backend_2d(&mut backend, UniformGrid2D {
            cell_size: 10.0, cells: std::collections::HashMap::new(), cell_order: Vec::new(),
            bounds: std::collections::HashMap::new(), object_order: Vec::new(),
            overflow: std::collections::HashSet::new(), overflow_order: Vec::new(),
            declined: std::collections::HashMap::new(), min_cell_x: 0, min_cell_y: 0,
            max_cell_x: 0, max_cell_y: 0, seen: std::collections::HashSet::new(),
            seen_order: Vec::new(), pair_ids: Vec::new(),
        });
        let mut out = create_spatial_index_2d(Some(backend));
        insert_spatial_object_2d(&mut out, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 5.0, max_y: 5.0 });
        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut point, &mut out, 2.5, 2.5);
        assert_eq!(point, vec![1]);
    }
}

mod max_indexed_cells_per_object {
    use super::*;

    #[test]
    fn per_object_cell_budget() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        let side = (MAX_INDEXED_CELLS_PER_OBJECT as f32).sqrt();
        assert_eq!(side, side.floor());
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: side - 1.0, max_y: side - 1.0 });
        let explanation = explain_spatial_indexing_2d(&grid, 1);
        assert_eq!(explanation.bucket_count, MAX_INDEXED_CELLS_PER_OBJECT as f64);
        assert_eq!(explanation.mode, SpatialIndexingMode::Cells);

        insert_spatial_object_2d(&mut grid, 2, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: side, max_y: side - 1.0 });
        assert_eq!(explain_spatial_indexing_2d(&grid, 2).mode, SpatialIndexingMode::Overflow);
    }
}

mod non_finite_bounds {
    use super::*;

    #[test]
    fn declines_rather_than_indexing() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        assert!(!insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: f32::NAN, min_y: 0.0, max_x: 10.0, max_y: 10.0 }));
        assert!(!insert_spatial_object_2d(&mut grid, 2, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: f32::INFINITY, max_y: 10.0 }));
        assert!(!insert_spatial_object_2d(&mut grid, 3, &SpatialAabb2D { min_x: 0.0, min_y: f32::NEG_INFINITY, max_x: 10.0, max_y: 10.0 }));
        let explanation = explain_spatial_indexing_2d(&grid, 1);
        assert_eq!(explanation.bucket_count, 0.0);
        assert_eq!(explanation.mode, SpatialIndexingMode::Declined);
        assert_eq!(explanation.reason, Some(SpatialDeclineReason::NonFiniteBounds));
    }

    #[test]
    fn returns_true_for_finite_bounds() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        assert!(insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 10.0, max_y: 10.0 }));
    }

    #[test]
    fn keeps_declined_out_of_every_query() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: f32::NAN, min_y: f32::NAN, max_x: f32::NAN, max_y: f32::NAN });
        insert_spatial_object_2d(&mut grid, 2, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 10.0, max_y: 10.0 });

        let mut region: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut region, &mut grid, &SpatialAabb2D { min_x: -1e6, min_y: -1e6, max_x: 1e6, max_y: 1e6 });
        assert_eq!(region, vec![2]);

        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut point, &mut grid, 5.0, 5.0);
        assert_eq!(point, vec![2]);

        let mut ray: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_2d(&mut ray, &mut grid, -5.0, 5.0, 1.0, 0.0);
        assert_eq!(ray, vec![2]);

        let pairs = query_spatial_pairs_2d(&mut grid);
        assert!(pairs.is_empty());
    }

    #[test]
    fn drops_object_updating_to_non_finite_bounds() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 10.0, max_y: 10.0 });
        assert!(!update_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: f32::NAN, min_y: f32::NAN, max_x: f32::NAN, max_y: f32::NAN }));
        assert_eq!(explain_spatial_indexing_2d(&grid, 1).mode, SpatialIndexingMode::Declined);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut out, &mut grid, 5.0, 5.0);
        assert!(out.is_empty());
    }

    #[test]
    fn declined_object_recovers_on_finite_update() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: f32::NAN, min_y: f32::NAN, max_x: f32::NAN, max_y: f32::NAN });
        assert!(update_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 10.0, max_y: 10.0 }));
        assert_eq!(explain_spatial_indexing_2d(&grid, 1).mode, SpatialIndexingMode::Cells);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut out, &mut grid, 5.0, 5.0);
        assert_eq!(out, vec![1]);
    }
}

mod oversized_extent_bound {
    use super::*;

    #[test]
    fn holds_oversized_object_without_writing_cell_per_unit() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 200.0, max_y: 200.0 });
        let explanation = explain_spatial_indexing_2d(&grid, 1);
        assert_eq!(explanation.mode, SpatialIndexingMode::Overflow);
        assert_eq!(explanation.bucket_count, 0.0);
    }

    #[test]
    fn indexes_extreme_aabb_in_constant_time() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        assert!(insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: -1e12, min_y: -1e12, max_x: 1e12, max_y: 1e12 }));
        assert_eq!(explain_spatial_indexing_2d(&grid, 1).mode, SpatialIndexingMode::Overflow);
    }

    #[test]
    fn oversized_object_remains_queryable() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: -1e12, min_y: -1e12, max_x: 1e12, max_y: 1e12 });
        insert_spatial_object_2d(&mut grid, 2, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 1.0, max_y: 1.0 });

        let mut region: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut region, &mut grid, &SpatialAabb2D { min_x: 100.0, min_y: 100.0, max_x: 101.0, max_y: 101.0 });
        assert_eq!(region, vec![1]);

        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut point, &mut grid, 500.0, 500.0);
        assert_eq!(point, vec![1]);

        let mut ray: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_2d(&mut ray, &mut grid, 1e6, 1e6, 1.0, 0.0);
        assert_eq!(ray, vec![1]);

        let pairs = query_spatial_pairs_2d(&mut grid);
        assert_eq!(pair_keys(&pairs), vec!["1-2"]);
    }

    #[test]
    fn emits_each_overflow_pair_once() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: -1e9, min_y: -1e9, max_x: 1e9, max_y: 1e9 });
        insert_spatial_object_2d(&mut grid, 2, &SpatialAabb2D { min_x: -1e9, min_y: -1e9, max_x: 1e9, max_y: 1e9 });
        insert_spatial_object_2d(&mut grid, 3, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 1.0, max_y: 1.0 });
        let pairs = query_spatial_pairs_2d(&mut grid);
        assert_eq!(pair_keys(&pairs), vec!["1-2", "1-3", "2-3"]);
    }

    #[test]
    fn does_not_pair_overflow_with_disjoint() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 100000.0, max_y: 100000.0 });
        insert_spatial_object_2d(&mut grid, 2, &SpatialAabb2D { min_x: -50.0, min_y: -50.0, max_x: -40.0, max_y: -40.0 });
        let pairs = query_spatial_pairs_2d(&mut grid);
        assert!(pairs.is_empty());
    }

    #[test]
    fn removes_oversized_object() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: -1e12, min_y: -1e12, max_x: 1e12, max_y: 1e12 });
        remove_spatial_object_2d(&mut grid, 1);
        assert_eq!(explain_spatial_indexing_2d(&grid, 1).mode, SpatialIndexingMode::Absent);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut out, &mut grid, 0.0, 0.0);
        assert!(out.is_empty());
    }

    #[test]
    fn transitions_between_cells_and_overflow() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 2.0, max_y: 2.0 });
        assert_eq!(explain_spatial_indexing_2d(&grid, 1).mode, SpatialIndexingMode::Cells);
        update_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: -1e12, min_y: -1e12, max_x: 1e12, max_y: 1e12 });
        assert_eq!(explain_spatial_indexing_2d(&grid, 1).mode, SpatialIndexingMode::Overflow);
        update_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 2.0, max_y: 2.0 });
        assert_eq!(explain_spatial_indexing_2d(&grid, 1).mode, SpatialIndexingMode::Cells);

        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut out, &mut grid, 1.0, 1.0);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn keeps_oversized_out_of_ray_traversal_cell_range() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 1.0, max_y: 1.0 });
        insert_spatial_object_2d(&mut grid, 2, &SpatialAabb2D { min_x: -1e12, min_y: -1e12, max_x: 1e12, max_y: 1e12 });
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_2d(&mut out, &mut grid, -5.0, 0.5, 1.0, 0.0);
        assert_eq!(sorted_ids(&out), vec![1, 2]);
    }

    #[test]
    fn clears_overflow_with_the_rest() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: -1e12, min_y: -1e12, max_x: 1e12, max_y: 1e12 });
        clear_spatial_index_2d(&mut grid);
        assert_eq!(explain_spatial_indexing_2d(&grid, 1).mode, SpatialIndexingMode::Absent);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut out, &mut grid, 0.0, 0.0);
        assert!(out.is_empty());
    }
}

mod oversized_region_query {
    use super::*;

    #[test]
    fn answers_region_far_wider_than_grid() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 1.0, max_y: 1.0 });
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut out, &mut grid, &SpatialAabb2D { min_x: -1e12, min_y: -1e12, max_x: 1e12, max_y: 1e12 });
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn still_excludes_objects_the_wide_region_misses() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 1.0, max_y: 1.0 });
        insert_spatial_object_2d(&mut grid, 2, &SpatialAabb2D { min_x: 5e11, min_y: 0.0, max_x: 5e11 + 1.0, max_y: 1.0 });
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut out, &mut grid, &SpatialAabb2D { min_x: -1e12, min_y: -1e12, max_x: 10.0, max_y: 1e12 });
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn returns_the_same_objects_either_way() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        for i in 0..40i32 {
            insert_spatial_object_2d(&mut grid, i, &SpatialAabb2D { min_x: i as f32, min_y: 0.0, max_x: i as f32 + 0.5, max_y: 1.0 });
        }
        let mut wide: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut wide, &mut grid, &SpatialAabb2D { min_x: -1e9, min_y: -1e9, max_x: 1e9, max_y: 1e9 });
        let mut narrow: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut narrow, &mut grid, &SpatialAabb2D { min_x: -1.0, min_y: -1.0, max_x: 41.0, max_y: 2.0 });
        assert_eq!(sorted_ids(&wide), sorted_ids(&narrow));
        assert_eq!(wide.len(), 40);
    }
}

mod ray_edge_cases {
    use super::*;

    #[test]
    fn finds_objects_along_cell_corner_diagonals() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 10.0, min_y: 10.0, max_x: 12.0, max_y: 12.0 });
        insert_spatial_object_2d(&mut grid, 2, &SpatialAabb2D { min_x: 20.0, min_y: 20.0, max_x: 22.0, max_y: 22.0 });
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_2d(&mut out, &mut grid, -5.0, -5.0, 1.0, 1.0);
        assert_eq!(sorted_ids(&out), vec![1, 2]);
    }

    #[test]
    fn finds_object_when_ray_starts_inside() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 5.0, min_y: 5.0, max_x: 15.0, max_y: 15.0 });
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_2d(&mut out, &mut grid, 10.0, 10.0, -1.0, 0.0);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn clips_ray_entering_from_far_outside() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 100.0, min_y: 30.0, max_x: 110.0, max_y: 40.0 });
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_2d(&mut out, &mut grid, -1e9, 35.0, 1.0, 0.0);
        assert_eq!(out, vec![1]);
    }
}

mod update_spatial_object_2d {
    use super::*;

    #[test]
    fn fast_path_refreshes_exact_bounds() {
        let mut grid = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        insert_spatial_object_2d(&mut grid, 1, &SpatialAabb2D { min_x: 1.0, min_y: 1.0, max_x: 18.0, max_y: 18.0 });
        let updated = SpatialAabb2D { min_x: 4.0, min_y: 4.0, max_x: 19.0, max_y: 19.0 };
        assert!(update_spatial_object_2d(&mut grid, 1, &updated));

        let mut old_point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut old_point, &mut grid, 2.0, 2.0);
        assert!(old_point.is_empty());
        let mut new_point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut new_point, &mut grid, 5.0, 5.0);
        assert_eq!(new_point, vec![1]);
    }
}
