use flight_math::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    let limit = (5e-9_f32).max(4.0 * f32::EPSILON * expected.abs().max(1.0));
    assert!(
        diff <= limit,
        "expected {expected}, got {actual} (diff: {diff}, limit: {limit})"
    );
}

mod pick {
    use super::*;

    #[test]
    fn keeps_seeded_endpoint_indices_inside_pick_and_shuffle_buffers() {
        let random = create_random_source(52078625);
        assert_eq!(pick(random.as_ref(), &[0, 1, 2, 3]), Some(3));
        let random = create_random_source(52078625);
        let mut items = [0, 1, 2, 3];
        shuffle_in_place(random.as_ref(), &mut items);
        items.sort();
        assert_eq!(items, [0, 1, 2, 3]);
    }

    #[test]
    fn returns_an_element_from_the_slice() {
        let items = [1, 2, 3, 4, 5];
        let random = create_random_source(0xabcdef);
        for _ in 0..50 {
            let result = pick(random.as_ref(), &items);
            assert!(result.is_some());
            assert!(items.contains(&result.unwrap()));
        }
    }

    #[test]
    fn returns_none_for_an_empty_slice() {
        let empty: &[i32] = &[];
        assert!(pick(create_random_source(0xabcdef).as_ref(), empty).is_none());
    }

    #[test]
    fn always_returns_the_only_element_in_a_single_item_slice() {
        let random = create_random_source(0xabcdef);
        for _ in 0..20 {
            assert_eq!(pick(random.as_ref(), &[42]), Some(42));
        }
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let items = ["a", "b", "c", "d"];
        let a = create_random_source(0xabcdef);
        let b = create_random_source(0xabcdef);
        for _ in 0..20 {
            assert_eq!(pick(a.as_ref(), &items), pick(b.as_ref(), &items));
        }
    }

    #[test]
    fn selects_the_bucket_named_by_an_exact_deterministic_sample() {
        assert_eq!(pick(&|| 0.75, &["a", "b", "c", "d"]), Some("d"));
    }
}

mod random_exponential {
    use super::*;

    #[test]
    fn returns_a_non_negative_value() {
        let random = create_random_source(0xabcdef);
        for _ in 0..200 {
            assert!(random_exponential(random.as_ref(), None) >= 0.0);
        }
    }

    #[test]
    fn mean_approximates_1_over_rate_for_rate_1() {
        let random = create_random_source(0xabcdef);
        let mut sum = 0.0_f32;
        let n = 5000;
        for _ in 0..n {
            sum += random_exponential(random.as_ref(), None);
        }
        let avg = sum / n as f32;
        assert!((avg - 1.0).abs() < 0.2);
    }

    #[test]
    fn mean_approximates_1_over_rate_for_rate_2() {
        let random = create_random_source(0xabcdef);
        let mut sum = 0.0_f32;
        let n = 5000;
        for _ in 0..n {
            sum += random_exponential(random.as_ref(), Some(2.0));
        }
        let avg = sum / n as f32;
        assert!((avg - 0.5).abs() < 0.2);
    }

    #[test]
    fn throws_for_rate_zero() {
        crate::assert_range_error(
            || {
                random_exponential(create_random_source(0xabcdef).as_ref(), Some(0.0));
            },
            "randomExponential: rate must be finite and > 0",
        );
    }

    #[test]
    fn throws_for_negative_rate() {
        crate::assert_range_error(
            || {
                random_exponential(create_random_source(0xabcdef).as_ref(), Some(-1.0));
            },
            "randomExponential: rate must be finite and > 0",
        );
    }

    #[test]
    fn rejects_nan_rate() {
        crate::assert_range_error(
            || {
                random_exponential(create_random_source(0xabcdef).as_ref(), Some(f32::NAN));
            },
            "randomExponential: rate must be finite and > 0",
        );
    }

    #[test]
    fn rejects_infinite_rate() {
        crate::assert_range_error(
            || {
                random_exponential(create_random_source(0xabcdef).as_ref(), Some(f32::INFINITY));
            },
            "randomExponential: rate must be finite and > 0",
        );
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let a = create_random_source(0xabcdef);
        let b = create_random_source(0xabcdef);
        for _ in 0..20 {
            assert_eq!(
                random_exponential(a.as_ref(), None),
                random_exponential(b.as_ref(), None)
            );
        }
    }

    #[test]
    fn substitutes_epsilon_when_the_random_source_returns_zero() {
        assert_eq!(
            random_exponential(&|| 0.0, None),
            -(2.220446049250313e-16_f32).ln()
        );
    }
}

mod random_gaussian {
    use super::*;

    #[test]
    fn produces_finite_values() {
        let random = create_random_source(0xabcdef);
        for _ in 0..100 {
            assert!(random_gaussian(random.as_ref(), None, None).is_finite());
        }
    }

    #[test]
    fn centers_around_the_mean() {
        let random = create_random_source(0xabcdef);
        let mut sum = 0.0_f32;
        let n = 2000;
        for _ in 0..n {
            sum += random_gaussian(random.as_ref(), Some(5.0), None);
        }
        let avg = sum / n as f32;
        assert!((avg - 5.0).abs() < 0.5);
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let a = create_random_source(0xabcdef);
        let b = create_random_source(0xabcdef);
        for _ in 0..20 {
            assert_eq!(
                random_gaussian(a.as_ref(), None, None),
                random_gaussian(b.as_ref(), None, None)
            );
        }
    }

    #[test]
    fn substitutes_epsilon_when_the_first_random_sample_is_zero() {
        let random = crate::sequence_random(&[0.0, 0.25]);
        let actual = random_gaussian(&random, None, None);
        assert!(
            actual.abs() < 5e-11,
            "TS zero-sample value should be close to 0 at 10 digits, got {actual}"
        );
    }

    #[test]
    fn matches_a_deterministic_box_muller_vector_with_mean_and_scale() {
        let standard = (-2.0 * 0.5_f32.ln()).sqrt();
        let random = crate::sequence_random(&[0.5, 0.0]);
        assert!(
            (random_gaussian(&random, Some(10.0), Some(2.0)) - (10.0 + standard * 2.0)).abs()
                < 5e-13
        );
    }
}

mod random_gaussian_pair {
    use super::*;

    #[test]
    fn returns_a_tuple_of_two_finite_values() {
        let random = create_random_source(0xabcdef);
        let (z0, z1) = random_gaussian_pair(random.as_ref(), None, None);
        assert!(z0.is_finite());
        assert!(z1.is_finite());
    }

    #[test]
    fn produces_values_matching_the_requested_mean() {
        let random = create_random_source(0xabcdef);
        let mut sum = 0.0_f32;
        let n = 2000;
        for _ in 0..n {
            let (z0, z1) = random_gaussian_pair(random.as_ref(), Some(10.0), None);
            sum += z0 + z1;
        }
        let avg = sum / (n * 2) as f32;
        assert!((avg - 10.0).abs() < 0.5);
    }

    #[test]
    fn substitutes_epsilon_when_the_first_random_sample_is_zero() {
        let random = crate::sequence_random(&[0.0, 0.25]);
        let (z0, z1) = random_gaussian_pair(&random, None, None);
        assert!(
            z0.abs() < 5e-11,
            "TS zero-sample first component should be close to 0 at 10 digits, got {z0}"
        );
        assert!((z1 - (-2.0 * (2.220446049250313e-16_f32).ln()).sqrt()).abs() < 5e-11);
    }

    #[test]
    fn matches_both_values_of_a_deterministic_box_muller_pair() {
        let component = (-2.0 * 0.5_f32.ln()).sqrt() * std::f32::consts::FRAC_1_SQRT_2;
        let random = crate::sequence_random(&[0.5, 0.125]);
        assert_eq!(
            random_gaussian_pair(&random, Some(3.0), Some(2.0)),
            (3.0 + component * 2.0, 3.0 + component * 2.0)
        );
    }
}

mod random_inside_unit_disc {
    use super::*;

    #[test]
    fn produces_points_inside_the_unit_disc() {
        let random = create_random_source(0xabcdef);
        let mut out = [0.0_f32; 2];
        for _ in 0..200 {
            random_inside_unit_disc(&mut out, random.as_ref());
            assert!(out[0] * out[0] + out[1] * out[1] <= 1.0 + 1e-9);
        }
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let a = create_random_source(0xabcdef);
        let b = create_random_source(0xabcdef);
        let mut out_a = [0.0_f32; 2];
        let mut out_b = [0.0_f32; 2];
        for _ in 0..20 {
            random_inside_unit_disc(&mut out_a, a.as_ref());
            random_inside_unit_disc(&mut out_b, b.as_ref());
            assert_eq!(out_a[0], out_b[0]);
            assert_eq!(out_a[1], out_b[1]);
        }
    }

    #[test]
    fn is_alias_safe_when_out_is_the_same_object_as_input() {
        let random = create_random_source(0xabcdef);
        let mut out = [0.0_f32; 2];
        random_inside_unit_disc(&mut out, random.as_ref());
        assert!(out[0].is_finite());
        assert!(out[1].is_finite());
    }

    #[test]
    fn accepts_and_preserves_a_deterministic_boundary_point() {
        let random = crate::sequence_random(&[1.0, 0.5, 0.5, 0.5]);
        let mut out = [0.0_f32; 2];
        random_inside_unit_disc(&mut out, &random);
        assert_eq!(out, [1.0, 0.0]);
    }
}

mod random_inside_unit_sphere {
    use super::*;

    #[test]
    fn produces_points_with_radius_less_than_or_equal_to_1() {
        let random = create_random_source(0xabcdef);
        let mut out = [0.0_f32; 3];
        for _ in 0..200 {
            random_inside_unit_sphere(&mut out, random.as_ref());
            assert!(out[0] * out[0] + out[1] * out[1] + out[2] * out[2] <= 1.0 + 1e-9);
        }
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let a = create_random_source(0xabcdef);
        let b = create_random_source(0xabcdef);
        let mut out_a = [0.0_f32; 3];
        let mut out_b = [0.0_f32; 3];
        for _ in 0..20 {
            random_inside_unit_sphere(&mut out_a, a.as_ref());
            random_inside_unit_sphere(&mut out_b, b.as_ref());
            assert_eq!(out_a[0], out_b[0]);
            assert_eq!(out_a[1], out_b[1]);
            assert_eq!(out_a[2], out_b[2]);
        }
    }

    #[test]
    fn is_alias_safe_when_out_is_the_same_object_as_input() {
        let random = create_random_source(0xabcdef);
        let mut out = [0.0_f32; 3];
        random_inside_unit_sphere(&mut out, random.as_ref());
        assert!(out[0].is_finite());
        assert!(out[1].is_finite());
        assert!(out[2].is_finite());
    }

    #[test]
    fn accepts_and_preserves_a_deterministic_boundary_point() {
        let random = crate::sequence_random(&[1.0, 0.5, 0.5, 0.5, 0.5, 0.5]);
        let mut out = [0.0_f32; 3];
        random_inside_unit_sphere(&mut out, &random);
        assert_eq!(out, [1.0, 0.0, 0.0]);
    }
}

mod random_on_unit_circle {
    use super::*;

    #[test]
    fn produces_points_on_the_unit_circle() {
        let random = create_random_source(0xabcdef);
        let mut out = [0.0_f32; 2];
        for _ in 0..100 {
            random_on_unit_circle(&mut out, random.as_ref());
            // D1 f32 bound (TS: 5e-9)
            assert_approx(out[0] * out[0] + out[1] * out[1], 1.0);
        }
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let a = create_random_source(0xabcdef);
        let b = create_random_source(0xabcdef);
        let mut out_a = [0.0_f32; 2];
        let mut out_b = [0.0_f32; 2];
        for _ in 0..20 {
            random_on_unit_circle(&mut out_a, a.as_ref());
            random_on_unit_circle(&mut out_b, b.as_ref());
            assert_eq!(out_a[0], out_b[0]);
            assert_eq!(out_a[1], out_b[1]);
        }
    }

    #[test]
    fn is_alias_safe_when_out_is_the_same_object_as_input() {
        let random = create_random_source(0xabcdef);
        let mut out = [0.0_f32; 2];
        random_on_unit_circle(&mut out, random.as_ref());
        assert!(out[0].is_finite());
        assert!(out[1].is_finite());
    }

    #[test]
    fn maps_a_quarter_turn_sample_to_the_top_of_the_circle() {
        let mut out = [0.0_f32; 2];
        random_on_unit_circle(&mut out, &|| 0.25);
        assert!(
            out[0].abs() < 5e-13,
            "TS quarter-turn x should be close to 0 at 12 digits, got {}",
            out[0]
        );
        assert!((out[1] - 1.0).abs() < 5e-13);
    }
}

mod random_on_unit_sphere {
    use super::*;

    #[test]
    fn produces_points_on_the_unit_sphere() {
        let random = create_random_source(0xabcdef);
        let mut out = [0.0_f32; 3];
        for _ in 0..100 {
            random_on_unit_sphere(&mut out, random.as_ref());
            let len2 = out[0] * out[0] + out[1] * out[1] + out[2] * out[2];
            // D1 f32 bound (TS: 5e-9)
            assert_approx(len2, 1.0);
        }
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let a = create_random_source(0xabcdef);
        let b = create_random_source(0xabcdef);
        let mut out_a = [0.0_f32; 3];
        let mut out_b = [0.0_f32; 3];
        for _ in 0..20 {
            random_on_unit_sphere(&mut out_a, a.as_ref());
            random_on_unit_sphere(&mut out_b, b.as_ref());
            assert_eq!(out_a[0], out_b[0]);
            assert_eq!(out_a[1], out_b[1]);
            assert_eq!(out_a[2], out_b[2]);
        }
    }

    #[test]
    fn is_alias_safe_when_out_is_the_same_object_as_input() {
        let random = create_random_source(0xabcdef);
        let mut out = [0.0_f32; 3];
        random_on_unit_sphere(&mut out, random.as_ref());
        assert!(out[0].is_finite());
        assert!(out[1].is_finite());
        assert!(out[2].is_finite());
    }

    #[test]
    fn projects_a_deterministic_disc_sample_onto_the_sphere() {
        let mut out = [0.0_f32; 3];
        let random = crate::sequence_random(&[0.75, 0.5]);
        random_on_unit_sphere(&mut out, &random);
        assert!((out[0] - 3.0_f32.sqrt() / 2.0).abs() < 5e-13);
        assert_eq!(out[1], 0.0);
        assert_eq!(out[2], 0.5);
    }

    #[test]
    fn rejects_a_disc_boundary_sample_before_projecting() {
        let mut out = [0.0_f32; 3];
        let random = crate::sequence_random(&[1.0, 0.5, 0.5, 0.5]);
        random_on_unit_sphere(&mut out, &random);
        assert_eq!(out, [0.0, 0.0, 1.0]);
    }
}

mod random_poisson {
    use super::*;

    #[test]
    fn returns_a_non_negative_integer() {
        let random = create_random_source(0xabcdef);
        for _ in 0..200 {
            let k = random_poisson(random.as_ref(), Some(3.0));
            assert!(k >= 0);
        }
    }

    #[test]
    fn mean_approximates_lambda_1() {
        let random = create_random_source(0xabcdef);
        let mut sum = 0_i32;
        let n = 5000;
        for _ in 0..n {
            sum += random_poisson(random.as_ref(), None);
        }
        let avg = sum as f32 / n as f32;
        assert!((avg - 1.0).abs() < 0.2);
    }

    #[test]
    fn mean_approximates_lambda_5() {
        let random = create_random_source(0xabcdef);
        let mut sum = 0_i32;
        let n = 5000;
        for _ in 0..n {
            sum += random_poisson(random.as_ref(), Some(5.0));
        }
        let avg = sum as f32 / n as f32;
        assert!((avg - 5.0).abs() < 0.5);
    }

    #[test]
    fn throws_for_lambda_zero() {
        crate::assert_range_error(
            || {
                random_poisson(create_random_source(0xabcdef).as_ref(), Some(0.0));
            },
            "randomPoisson: lambda must be finite and > 0",
        );
    }

    #[test]
    fn throws_for_negative_lambda() {
        crate::assert_range_error(
            || {
                random_poisson(create_random_source(0xabcdef).as_ref(), Some(-1.0));
            },
            "randomPoisson: lambda must be finite and > 0",
        );
    }

    #[test]
    fn rejects_nan_lambda() {
        crate::assert_range_error(
            || {
                random_poisson(create_random_source(0xabcdef).as_ref(), Some(f32::NAN));
            },
            "randomPoisson: lambda must be finite and > 0",
        );
    }

    #[test]
    fn rejects_infinite_lambda() {
        crate::assert_range_error(
            || {
                random_poisson(create_random_source(0xabcdef).as_ref(), Some(f32::INFINITY));
            },
            "randomPoisson: lambda must be finite and > 0",
        );
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let a = create_random_source(0xabcdef);
        let b = create_random_source(0xabcdef);
        for _ in 0..20 {
            assert_eq!(
                random_poisson(a.as_ref(), Some(3.0)),
                random_poisson(b.as_ref(), Some(3.0))
            );
        }
    }

    #[test]
    fn stops_when_the_product_exactly_reaches_the_limit() {
        let random = crate::sequence_random(&[0.5, 0.5]);
        assert_eq!(random_poisson(&random, Some(2.0_f32.ln())), 0);
    }
}

mod random_weighted {
    use super::*;

    #[test]
    fn returns_indices_within_the_weights_slice() {
        let random = create_random_source(0xabcdef);
        let weights = [1.0_f32, 2.0, 3.0];
        for _ in 0..100 {
            let idx = random_weighted(random.as_ref(), &weights);
            assert!(idx >= 0);
            assert!((idx as usize) < weights.len());
        }
    }

    #[test]
    fn returns_negative_1_for_an_empty_slice() {
        assert_eq!(
            random_weighted(create_random_source(0xabcdef).as_ref(), &[]),
            -1
        );
    }

    #[test]
    fn returns_negative_1_for_an_all_zero_weight_slice() {
        assert_eq!(
            random_weighted(create_random_source(0xabcdef).as_ref(), &[0.0, 0.0, 0.0]),
            -1
        );
    }

    #[test]
    fn always_returns_the_only_non_zero_index_when_all_others_are_zero() {
        let random = create_random_source(0xabcdef);
        for _ in 0..20 {
            assert_eq!(random_weighted(random.as_ref(), &[0.0, 10.0, 0.0]), 1);
        }
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let a = create_random_source(0xabcdef);
        let b = create_random_source(0xabcdef);
        let weights = [1.0_f32, 2.0, 3.0, 4.0];
        for _ in 0..20 {
            assert_eq!(
                random_weighted(a.as_ref(), &weights),
                random_weighted(b.as_ref(), &weights)
            );
        }
    }

    #[test]
    fn falls_back_to_the_final_bucket_for_an_out_of_range_random_source() {
        assert_eq!(random_weighted(&|| 1.1, &[1.0, 2.0, 7.0]), 2);
    }

    #[test]
    fn selects_the_earlier_bucket_when_the_sample_lands_exactly_on_its_boundary() {
        assert_eq!(random_weighted(&|| 1.0 / 3.0, &[1.0, 2.0]), 0);
    }
}

mod shuffle {
    use super::*;

    #[test]
    fn returns_a_vec_of_the_same_length() {
        let items = [1, 2, 3, 4, 5];
        assert_eq!(
            shuffle(create_random_source(0xabcdef).as_ref(), &items).len(),
            items.len()
        );
    }

    #[test]
    fn contains_all_original_elements() {
        let items = [1, 2, 3, 4, 5];
        let mut result = shuffle(create_random_source(0xabcdef).as_ref(), &items);
        result.sort();
        let mut expected = items.to_vec();
        expected.sort();
        assert_eq!(result, expected);
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let items = [1, 2, 3, 4, 5, 6, 7, 8];
        assert_eq!(
            shuffle(create_random_source(0xabcdef).as_ref(), &items),
            shuffle(create_random_source(0xabcdef).as_ref(), &items)
        );
    }

    #[test]
    fn does_not_mutate_the_original_array() {
        let items = [1, 2, 3, 4, 5];
        let original = items;
        shuffle(create_random_source(0xabcdef).as_ref(), &items);
        assert_eq!(items, original);
    }
}

mod shuffle_in_place {
    use super::*;

    #[test]
    fn retains_all_original_elements() {
        let mut items = vec![1, 2, 3, 4, 5];
        let mut expected = items.clone();
        expected.sort();
        shuffle_in_place(create_random_source(0xabcdef).as_ref(), &mut items);
        items.sort();
        assert_eq!(items, expected);
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let mut a = vec![1, 2, 3, 4, 5, 6, 7, 8];
        let mut b = vec![1, 2, 3, 4, 5, 6, 7, 8];
        shuffle_in_place(create_random_source(0xabcdef).as_ref(), &mut a);
        shuffle_in_place(create_random_source(0xabcdef).as_ref(), &mut b);
        assert_eq!(a, b);
    }

    #[test]
    fn mutates_the_original_array() {
        let mut items = vec![1, 2, 3, 4, 5, 6, 7, 8];
        let copy = items.clone();
        shuffle_in_place(create_random_source(0xabcdef).as_ref(), &mut items);
        assert_eq!(items.len(), copy.len());
    }

    #[test]
    fn pins_the_swaps_and_consumes_exactly_one_sample_per_fisher_yates_step() {
        let values = [0.75, 0.5, 0.25];
        let calls = std::cell::Cell::new(0);
        let random = || {
            let index = calls.get();
            calls.set(index + 1);
            return values[index];
        };
        let mut items = ["a", "b", "c", "d"];
        shuffle_in_place(&random, &mut items);
        assert_eq!(items, ["c", "a", "b", "d"]);
        assert_eq!(calls.get(), 3);
    }
}
