use flight_path::*;
use flight_path_boolean::contract::*;

fn flattened_path(path: &Path, tolerance: Option<f64>) -> Vec<Vec<f64>> {
    let out = flatten_path(path, tolerance);
    return out;
}

// The xorshift32 sequence; its state is a `u32` local so every target shifts and xors it as unsigned.
struct FuzzRandom {
    state: u32,
}

fn make_random(seed: u32) -> FuzzRandom {
    return FuzzRandom {
        state: if seed != 0 { seed } else { 1 },
    };
}

fn next_random(random: &mut FuzzRandom) -> f64 {
    let mut state: u32 = random.state;
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    random.state = state;
    return state as f64 / 4294967296.0;
}

fn polygon_path(vertices: &[f64]) -> Path {
    let mut path = create_path(Some(flight_path::PathWinding::NonZero));
    append_path_move_to(&mut path, vertices[0], vertices[1]);
    let mut i = 2;
    while i < vertices.len() {
        append_path_line_to(&mut path, vertices[i], vertices[i + 1]);
        i += 2;
    }
    append_path_close(&mut path);
    return path;
}

fn random_simple_polygon(random: &mut FuzzRandom, count: usize) -> Vec<f64> {
    let mut angles: Vec<f64> = Vec::new();
    for _ in 0..count {
        angles.push(next_random(random) * std::f64::consts::PI * 2.0);
    }
    angles.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let mut vertices: Vec<f64> = Vec::new();
    for angle in &angles {
        let radius = 20.0 + next_random(random) * 30.0;
        vertices.push(50.0 + radius * angle.cos());
        vertices.push(50.0 + radius * angle.sin());
    }
    return vertices;
}

fn random_convex_polygon(random: &mut FuzzRandom, count: usize) -> Vec<f64> {
    let mut points: Vec<[f64; 2]> = Vec::new();
    for _ in 0..count {
        points.push([
            10.0 + next_random(random) * 80.0,
            10.0 + next_random(random) * 80.0,
        ]);
    }
    return convex_hull(&points);
}

fn random_messy_polygon(random: &mut FuzzRandom, count: usize) -> Vec<f64> {
    let mut vertices: Vec<f64> = Vec::new();
    for _ in 0..count {
        vertices.push(next_random(random) * 100.0);
        vertices.push(next_random(random) * 100.0);
    }
    return vertices;
}

fn hull_cross(o: &[f64; 2], a: &[f64; 2], b: &[f64; 2]) -> f64 {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

fn convex_hull(points: &[[f64; 2]]) -> Vec<f64> {
    let mut sorted = points.to_vec();
    sorted.sort_by(|a, b| {
        if a[0] != b[0] {
            return a[0].partial_cmp(&b[0]).unwrap();
        }
        return a[1].partial_cmp(&b[1]).unwrap();
    });
    // Monotone chain over explicit stack lengths: `lower[..lower_length]` and `upper[..upper_length]`.
    let mut lower: Vec<[f64; 2]> = Vec::new();
    let mut lower_length: usize = 0;
    for p in &sorted {
        while lower_length >= 2
            && hull_cross(&lower[lower_length - 2], &lower[lower_length - 1], p) <= 0.0
        {
            lower_length -= 1;
        }
        if lower_length < lower.len() {
            lower[lower_length] = *p;
        } else {
            lower.push(*p);
        }
        lower_length += 1;
    }
    let mut upper: Vec<[f64; 2]> = Vec::new();
    let mut upper_length: usize = 0;
    let mut i = sorted.len();
    while i > 0 {
        i -= 1;
        let p = &sorted[i];
        while upper_length >= 2
            && hull_cross(&upper[upper_length - 2], &upper[upper_length - 1], p) <= 0.0
        {
            upper_length -= 1;
        }
        if upper_length < upper.len() {
            upper[upper_length] = *p;
        } else {
            upper.push(*p);
        }
        upper_length += 1;
    }
    let mut flat: Vec<f64> = Vec::new();
    for index in 0..lower_length - 1 {
        flat.push(lower[index][0]);
        flat.push(lower[index][1]);
    }
    for index in 0..upper_length - 1 {
        flat.push(upper[index][0]);
        flat.push(upper[index][1]);
    }
    return flat;
}

fn path_area(path: &Path) -> f64 {
    let mut total: f64 = 0.0;
    for ring in flattened_path(path, Some(0.25)) {
        let mut area: f64 = 0.0;
        let n = ring.len() >> 1;
        let mut j = n - 1;
        for i in 0..n {
            area += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
            j = i;
        }
        total += area / 2.0;
    }
    return total.abs();
}

fn ring_count(path: &Path) -> usize {
    return flattened_path(path, Some(0.25)).len();
}

fn areas_close(a: f64, b: f64, relative: f64, absolute: f64) -> bool {
    return (a - b).abs() <= absolute + relative * a.abs().max(b.abs());
}

mod fuzz_invariants {
    use super::*;

    #[test]
    fn same_winding_self_overlap_diverges_between_non_zero_and_even_odd() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut random = make_random(0x51a3e00d);
        for iteration in 0..40 {
            let vertices = random_convex_polygon(&mut random, 5 + (iteration % 8));
            if !(vertices.len() < 6) {
                let mut path = create_path(Some(flight_path::PathWinding::NonZero));
                append_path_move_to(&mut path, vertices[0], vertices[1]);
                for repeat in 0..2 {
                    let start = if repeat == 0 { 2 } else { 0 };
                    let mut i = start;
                    while i < vertices.len() {
                        append_path_line_to(&mut path, vertices[i], vertices[i + 1]);
                        i += 2;
                    }
                }
                append_path_close(&mut path);
                let nz_opts = PathBooleanOptions {
                    fill_rule: Some(PathWinding::NonZero),
                    tolerance: None,
                };
                let eo_opts = PathBooleanOptions {
                    fill_rule: Some(PathWinding::EvenOdd),
                    tolerance: None,
                };
                let mut non_zero = create_path(Some(flight_path::PathWinding::NonZero));
                simplify_path(&mut non_zero, &kernel, &path, Some(&nz_opts));
                let mut even_odd = create_path(Some(flight_path::PathWinding::NonZero));
                simplify_path(&mut even_odd, &kernel, &path, Some(&eo_opts));
                assert!(path_area(&non_zero) > 0.0);
                assert!(path_area(&even_odd) < 1e-6);
            }
        }
    }

    #[test]
    fn union_is_commutative() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut random = make_random(0x1234abcd);
        for iteration in 0..40 {
            let a = polygon_path(&random_simple_polygon(&mut random, 3 + (iteration % 6)));
            let b = polygon_path(&random_simple_polygon(
                &mut random,
                3 + ((iteration + 3) % 6),
            ));
            let mut ab = create_path(Some(flight_path::PathWinding::NonZero));
            union_paths(&mut ab, &kernel, &a, &b, None);
            let mut ba = create_path(Some(flight_path::PathWinding::NonZero));
            union_paths(&mut ba, &kernel, &b, &a, None);
            assert!(areas_close(path_area(&ab), path_area(&ba), 1e-3, 1e-3));
            assert_eq!(ring_count(&ab), ring_count(&ba));
        }
    }

    #[test]
    fn self_difference_is_empty() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut random = make_random(0x55aa33cc);
        for iteration in 0..40 {
            let a = polygon_path(&random_messy_polygon(&mut random, 4 + (iteration % 5)));
            let mut result = create_path(Some(flight_path::PathWinding::NonZero));
            difference_paths(&mut result, &kernel, &a, &a, None);
            assert!(path_area(&result) < 1e-6);
        }
    }

    #[test]
    fn self_union_equals_simplify() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut random = make_random(0x0f0f0f0f);
        for iteration in 0..40 {
            let a = polygon_path(&random_simple_polygon(&mut random, 3 + (iteration % 6)));
            let mut union_result = create_path(Some(flight_path::PathWinding::NonZero));
            union_paths(&mut union_result, &kernel, &a, &a, None);
            let mut simplified = create_path(Some(flight_path::PathWinding::NonZero));
            simplify_path(&mut simplified, &kernel, &a, None);
            assert!(areas_close(
                path_area(&union_result),
                path_area(&simplified),
                1e-3,
                1e-3
            ));
            assert_eq!(ring_count(&union_result), ring_count(&simplified));
        }
    }

    #[test]
    fn simplify_is_idempotent() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut random = make_random(0x7e577e57);
        for iteration in 0..40 {
            let a = polygon_path(&random_messy_polygon(&mut random, 4 + (iteration % 6)));
            let mut once = create_path(Some(flight_path::PathWinding::NonZero));
            simplify_path(&mut once, &kernel, &a, None);
            let mut twice = create_path(Some(flight_path::PathWinding::NonZero));
            simplify_path(&mut twice, &kernel, &once, None);
            assert!(areas_close(path_area(&once), path_area(&twice), 1e-3, 1e-3));
            assert_eq!(ring_count(&once), ring_count(&twice));
        }
    }

    #[test]
    fn union_all_paths_of_one_path_equals_its_simplification() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut random = make_random(0x13571357);
        for iteration in 0..40 {
            let a = polygon_path(&random_messy_polygon(&mut random, 4 + (iteration % 6)));
            let mut union_result = create_path(Some(flight_path::PathWinding::NonZero));
            union_all_paths(&mut union_result, &kernel, &[&a], None);
            let mut simplified = create_path(Some(flight_path::PathWinding::NonZero));
            simplify_path(&mut simplified, &kernel, &a, None);
            assert!(areas_close(
                path_area(&union_result),
                path_area(&simplified),
                1e-3,
                1e-3
            ));
            assert_eq!(ring_count(&union_result), ring_count(&simplified));
        }
    }

    #[test]
    fn offset_identity_zero_delta_approximates_original() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut random = make_random(0x2468ace0);
        for iteration in 0..40 {
            let vertices = random_simple_polygon(&mut random, 3 + (iteration % 6));
            let a = polygon_path(&vertices);
            let mut zero_offset = create_path(Some(flight_path::PathWinding::NonZero));
            offset_path(&mut zero_offset, &kernel, &a, 0.0, None);
            assert!(areas_close(
                path_area(&zero_offset),
                path_area(&a),
                1e-2,
                1e-2
            ));
            assert_eq!(ring_count(&zero_offset), 1);
        }
    }

    #[test]
    fn double_offset_stability_recovers_convex_shape_within_tolerance() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut random = make_random(0x0badf00d);
        for iteration in 0..40 {
            let vertices = random_convex_polygon(&mut random, 5 + (iteration % 8));
            if !(vertices.len() < 8) {
                let a = polygon_path(&vertices);
                let base_area = path_area(&a);
                if !(base_area < 50.0) {
                    let grow_opts = PathOffsetOptions {
                        join: Some(PathOffsetJoin::Miter),
                        end: None,
                        miter_limit: Some(100.0),
                        tolerance: None,
                        arc_tolerance: None,
                    };
                    let mut grown = create_path(Some(flight_path::PathWinding::NonZero));
                    offset_path(&mut grown, &kernel, &a, 3.0, Some(&grow_opts));
                    let shrink_opts = PathOffsetOptions {
                        join: Some(PathOffsetJoin::Miter),
                        end: None,
                        miter_limit: Some(100.0),
                        tolerance: None,
                        arc_tolerance: None,
                    };
                    let mut recovered = create_path(Some(flight_path::PathWinding::NonZero));
                    offset_path(&mut recovered, &kernel, &grown, -3.0, Some(&shrink_opts));
                    assert_eq!(ring_count(&recovered), 1);
                    assert!(areas_close(path_area(&recovered), base_area, 3e-2, 1.0));
                }
            }
        }
    }

    #[test]
    fn concave_offset_validity_no_self_intersections() {
        let kernel = create_martinez_path_boolean_kernel();
        let mut random = make_random(0x0c0ffee0);
        for iteration in 0..40 {
            let a = polygon_path(&random_simple_polygon(&mut random, 5 + (iteration % 8)));
            let mut offset_result = create_path(Some(flight_path::PathWinding::NonZero));
            offset_path(&mut offset_result, &kernel, &a, 4.0, None);
            if !(offset_result.commands.is_empty()) {
                let nz_opts = PathBooleanOptions {
                    fill_rule: Some(PathWinding::NonZero),
                    tolerance: None,
                };
                let mut simplified = create_path(Some(flight_path::PathWinding::NonZero));
                simplify_path(&mut simplified, &kernel, &offset_result, Some(&nz_opts));
                assert!(areas_close(
                    path_area(&simplified),
                    path_area(&offset_result),
                    1e-2,
                    1e-2
                ));
                assert_eq!(ring_count(&simplified), ring_count(&offset_result));
            }
        }
    }
}
