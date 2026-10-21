use flight_math::*;

fn rng() -> RandomSource {
    create_random_source(0xabcdef)
}

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod pick {
    use super::*;

    #[test]
    fn returns_an_element_from_the_slice() {
        let items = [1, 2, 3, 4, 5];
        let mut random = rng();
        for _ in 0..50 {
            let result = pick(&mut random, &items);
            assert!(result.is_some());
            assert!(items.contains(&result.unwrap()));
        }
    }

    #[test]
    fn returns_none_for_an_empty_slice() {
        let empty: &[i32] = &[];
        assert!(pick(&mut rng(), empty).is_none());
    }

    #[test]
    fn always_returns_the_only_element_in_a_single_item_slice() {
        let mut random = rng();
        for _ in 0..20 {
            assert_eq!(pick(&mut random, &[42]), Some(42));
        }
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let items = ["a", "b", "c", "d"];
        let mut a = rng();
        let mut b = rng();
        for _ in 0..20 {
            assert_eq!(pick(&mut a, &items), pick(&mut b, &items));
        }
    }
}

mod random_exponential {
    use super::*;

    #[test]
    fn returns_a_non_negative_value() {
        let mut random = rng();
        for _ in 0..200 {
            assert!(random_exponential(&mut random, 1.0) >= 0.0);
        }
    }

    #[test]
    fn mean_approximates_1_over_rate_for_rate_1() {
        let mut random = rng();
        let mut sum = 0.0_f32;
        let n = 5000;
        for _ in 0..n {
            sum += random_exponential(&mut random, 1.0);
        }
        let avg = sum / n as f32;
        assert!((avg - 1.0).abs() < 0.2);
    }

    #[test]
    fn mean_approximates_1_over_rate_for_rate_2() {
        let mut random = rng();
        let mut sum = 0.0_f32;
        let n = 5000;
        for _ in 0..n {
            sum += random_exponential(&mut random, 2.0);
        }
        let avg = sum / n as f32;
        assert!((avg - 0.5).abs() < 0.2);
    }

    #[test]
    #[should_panic(expected = "random_exponential: rate must be finite and > 0")]
    fn panics_for_rate_zero() {
        random_exponential(&mut rng(), 0.0);
    }

    #[test]
    #[should_panic(expected = "random_exponential: rate must be finite and > 0")]
    fn panics_for_negative_rate() {
        random_exponential(&mut rng(), -1.0);
    }

    #[test]
    #[should_panic(expected = "random_exponential: rate must be finite and > 0")]
    fn rejects_nan_rate() {
        random_exponential(&mut rng(), f32::NAN);
    }

    #[test]
    #[should_panic(expected = "random_exponential: rate must be finite and > 0")]
    fn rejects_infinite_rate() {
        random_exponential(&mut rng(), f32::INFINITY);
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let mut a = rng();
        let mut b = rng();
        for _ in 0..20 {
            assert_eq!(random_exponential(&mut a, 1.0), random_exponential(&mut b, 1.0));
        }
    }
}

mod random_gaussian {
    use super::*;

    #[test]
    fn produces_finite_values() {
        let mut random = rng();
        for _ in 0..100 {
            assert!(random_gaussian(&mut random, 0.0, 1.0).is_finite());
        }
    }

    #[test]
    fn centers_around_the_mean() {
        let mut random = rng();
        let mut sum = 0.0_f32;
        let n = 2000;
        for _ in 0..n {
            sum += random_gaussian(&mut random, 5.0, 1.0);
        }
        let avg = sum / n as f32;
        assert!((avg - 5.0).abs() < 0.5);
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let mut a = rng();
        let mut b = rng();
        for _ in 0..20 {
            assert_eq!(
                random_gaussian(&mut a, 0.0, 1.0),
                random_gaussian(&mut b, 0.0, 1.0)
            );
        }
    }
}

mod random_gaussian_pair {
    use super::*;

    #[test]
    fn returns_a_tuple_of_two_finite_values() {
        let mut random = rng();
        let (z0, z1) = random_gaussian_pair(&mut random, 0.0, 1.0);
        assert!(z0.is_finite());
        assert!(z1.is_finite());
    }

    #[test]
    fn produces_values_matching_the_requested_mean() {
        let mut random = rng();
        let mut sum = 0.0_f32;
        let n = 2000;
        for _ in 0..n {
            let (z0, z1) = random_gaussian_pair(&mut random, 10.0, 1.0);
            sum += z0 + z1;
        }
        let avg = sum / (n * 2) as f32;
        assert!((avg - 10.0).abs() < 0.5);
    }
}

mod random_inside_unit_disc {
    use super::*;

    #[test]
    fn produces_points_inside_the_unit_disc() {
        let mut random = rng();
        let mut out = [0.0_f32; 2];
        for _ in 0..200 {
            random_inside_unit_disc(&mut out, &mut random);
            assert!(out[0] * out[0] + out[1] * out[1] <= 1.0 + 1e-9);
        }
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let mut a = rng();
        let mut b = rng();
        let mut out_a = [0.0_f32; 2];
        let mut out_b = [0.0_f32; 2];
        for _ in 0..20 {
            random_inside_unit_disc(&mut out_a, &mut a);
            random_inside_unit_disc(&mut out_b, &mut b);
            assert_eq!(out_a[0], out_b[0]);
            assert_eq!(out_a[1], out_b[1]);
        }
    }
}

mod random_inside_unit_sphere {
    use super::*;

    #[test]
    fn produces_points_with_radius_less_than_or_equal_to_1() {
        let mut random = rng();
        let mut out = [0.0_f32; 3];
        for _ in 0..200 {
            random_inside_unit_sphere(&mut out, &mut random);
            assert!(out[0] * out[0] + out[1] * out[1] + out[2] * out[2] <= 1.0 + 1e-9);
        }
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let mut a = rng();
        let mut b = rng();
        let mut out_a = [0.0_f32; 3];
        let mut out_b = [0.0_f32; 3];
        for _ in 0..20 {
            random_inside_unit_sphere(&mut out_a, &mut a);
            random_inside_unit_sphere(&mut out_b, &mut b);
            assert_eq!(out_a[0], out_b[0]);
            assert_eq!(out_a[1], out_b[1]);
            assert_eq!(out_a[2], out_b[2]);
        }
    }
}

mod random_on_unit_circle {
    use super::*;

    #[test]
    fn produces_points_on_the_unit_circle() {
        let mut random = rng();
        let mut out = [0.0_f32; 2];
        for _ in 0..100 {
            random_on_unit_circle(&mut out, &mut random);
            assert_approx(out[0] * out[0] + out[1] * out[1], 1.0);
        }
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let mut a = rng();
        let mut b = rng();
        let mut out_a = [0.0_f32; 2];
        let mut out_b = [0.0_f32; 2];
        for _ in 0..20 {
            random_on_unit_circle(&mut out_a, &mut a);
            random_on_unit_circle(&mut out_b, &mut b);
            assert_eq!(out_a[0], out_b[0]);
            assert_eq!(out_a[1], out_b[1]);
        }
    }
}

mod random_on_unit_sphere {
    use super::*;

    #[test]
    fn produces_points_on_the_unit_sphere() {
        let mut random = rng();
        let mut out = [0.0_f32; 3];
        for _ in 0..100 {
            random_on_unit_sphere(&mut out, &mut random);
            let len2 = out[0] * out[0] + out[1] * out[1] + out[2] * out[2];
            assert_approx(len2, 1.0);
        }
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let mut a = rng();
        let mut b = rng();
        let mut out_a = [0.0_f32; 3];
        let mut out_b = [0.0_f32; 3];
        for _ in 0..20 {
            random_on_unit_sphere(&mut out_a, &mut a);
            random_on_unit_sphere(&mut out_b, &mut b);
            assert_eq!(out_a[0], out_b[0]);
            assert_eq!(out_a[1], out_b[1]);
            assert_eq!(out_a[2], out_b[2]);
        }
    }
}

mod random_poisson {
    use super::*;

    #[test]
    fn returns_a_non_negative_integer() {
        let mut random = rng();
        for _ in 0..200 {
            let k = random_poisson(&mut random, 3.0);
            assert!(k >= 0);
        }
    }

    #[test]
    fn mean_approximates_lambda_1() {
        let mut random = rng();
        let mut sum = 0_i32;
        let n = 5000;
        for _ in 0..n {
            sum += random_poisson(&mut random, 1.0);
        }
        let avg = sum as f32 / n as f32;
        assert!((avg - 1.0).abs() < 0.2);
    }

    #[test]
    fn mean_approximates_lambda_5() {
        let mut random = rng();
        let mut sum = 0_i32;
        let n = 5000;
        for _ in 0..n {
            sum += random_poisson(&mut random, 5.0);
        }
        let avg = sum as f32 / n as f32;
        assert!((avg - 5.0).abs() < 0.5);
    }

    #[test]
    #[should_panic(expected = "random_poisson: lambda must be finite and > 0")]
    fn panics_for_lambda_zero() {
        random_poisson(&mut rng(), 0.0);
    }

    #[test]
    #[should_panic(expected = "random_poisson: lambda must be finite and > 0")]
    fn panics_for_negative_lambda() {
        random_poisson(&mut rng(), -1.0);
    }

    #[test]
    #[should_panic(expected = "random_poisson: lambda must be finite and > 0")]
    fn rejects_nan_lambda() {
        random_poisson(&mut rng(), f32::NAN);
    }

    #[test]
    #[should_panic(expected = "random_poisson: lambda must be finite and > 0")]
    fn rejects_infinite_lambda() {
        random_poisson(&mut rng(), f32::INFINITY);
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let mut a = rng();
        let mut b = rng();
        for _ in 0..20 {
            assert_eq!(random_poisson(&mut a, 3.0), random_poisson(&mut b, 3.0));
        }
    }
}

mod random_weighted {
    use super::*;

    #[test]
    fn returns_indices_within_the_weights_slice() {
        let mut random = rng();
        let weights = [1.0_f32, 2.0, 3.0];
        for _ in 0..100 {
            let idx = random_weighted(&mut random, &weights);
            assert!(idx >= 0);
            assert!((idx as usize) < weights.len());
        }
    }

    #[test]
    fn returns_negative_1_for_an_empty_slice() {
        assert_eq!(random_weighted(&mut rng(), &[]), -1);
    }

    #[test]
    fn returns_negative_1_for_an_all_zero_weight_slice() {
        assert_eq!(random_weighted(&mut rng(), &[0.0, 0.0, 0.0]), -1);
    }

    #[test]
    fn always_returns_the_only_non_zero_index_when_all_others_are_zero() {
        let mut random = rng();
        for _ in 0..20 {
            assert_eq!(random_weighted(&mut random, &[0.0, 10.0, 0.0]), 1);
        }
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let mut a = rng();
        let mut b = rng();
        let weights = [1.0_f32, 2.0, 3.0, 4.0];
        for _ in 0..20 {
            assert_eq!(
                random_weighted(&mut a, &weights),
                random_weighted(&mut b, &weights)
            );
        }
    }
}

mod shuffle {
    use super::*;

    #[test]
    fn returns_a_vec_of_the_same_length() {
        let items = [1, 2, 3, 4, 5];
        assert_eq!(shuffle(&mut rng(), &items).len(), items.len());
    }

    #[test]
    fn contains_all_original_elements() {
        let items = [1, 2, 3, 4, 5];
        let mut result = shuffle(&mut rng(), &items);
        result.sort();
        let mut expected = items.to_vec();
        expected.sort();
        assert_eq!(result, expected);
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let items = [1, 2, 3, 4, 5, 6, 7, 8];
        assert_eq!(shuffle(&mut rng(), &items), shuffle(&mut rng(), &items));
    }
}

mod shuffle_in_place {
    use super::*;

    #[test]
    fn retains_all_original_elements() {
        let mut items = vec![1, 2, 3, 4, 5];
        let mut expected = items.clone();
        expected.sort();
        shuffle_in_place(&mut rng(), &mut items);
        items.sort();
        assert_eq!(items, expected);
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let mut a = vec![1, 2, 3, 4, 5, 6, 7, 8];
        let mut b = vec![1, 2, 3, 4, 5, 6, 7, 8];
        shuffle_in_place(&mut rng(), &mut a);
        shuffle_in_place(&mut rng(), &mut b);
        assert_eq!(a, b);
    }
}
