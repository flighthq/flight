use std::sync::Arc;

use flight_easing::*;

type Ease = Arc<dyn Fn(f32) -> f32 + Send + Sync>;

struct Family {
    ease_in: Ease,
    ease_in_out: Ease,
    ease_out: Ease,
    halves_match: bool,
    monotonic: bool,
    name: &'static str,
}

fn families() -> Vec<Family> {
    return vec![
        Family {
            ease_in: Arc::new(ease_in_back),
            ease_in_out: Arc::new(ease_in_out_back),
            ease_out: Arc::new(ease_out_back),
            halves_match: false,
            monotonic: false,
            name: "Back",
        },
        Family {
            ease_in: Arc::new(ease_in_bounce),
            ease_in_out: Arc::new(ease_in_out_bounce),
            ease_out: Arc::new(ease_out_bounce),
            halves_match: true,
            monotonic: false,
            name: "Bounce",
        },
        Family {
            ease_in: Arc::new(ease_in_circular),
            ease_in_out: Arc::new(ease_in_out_circular),
            ease_out: Arc::new(ease_out_circular),
            halves_match: true,
            monotonic: true,
            name: "Circular",
        },
        Family {
            ease_in: Arc::new(ease_in_cubic),
            ease_in_out: Arc::new(ease_in_out_cubic),
            ease_out: Arc::new(ease_out_cubic),
            halves_match: true,
            monotonic: true,
            name: "Cubic",
        },
        Family {
            ease_in: Arc::new(ease_in_elastic),
            ease_in_out: Arc::new(ease_in_out_elastic),
            ease_out: Arc::new(ease_out_elastic),
            halves_match: false,
            monotonic: false,
            name: "Elastic",
        },
        Family {
            ease_in: Arc::new(ease_in_exponential),
            ease_in_out: Arc::new(ease_in_out_exponential),
            ease_out: Arc::new(ease_out_exponential),
            halves_match: true,
            monotonic: true,
            name: "Exponential",
        },
        Family {
            ease_in: Arc::new(ease_in_quadratic),
            ease_in_out: Arc::new(ease_in_out_quadratic),
            ease_out: Arc::new(ease_out_quadratic),
            halves_match: true,
            monotonic: true,
            name: "Quadratic",
        },
        Family {
            ease_in: Arc::new(ease_in_quartic),
            ease_in_out: Arc::new(ease_in_out_quartic),
            ease_out: Arc::new(ease_out_quartic),
            halves_match: true,
            monotonic: true,
            name: "Quartic",
        },
        Family {
            ease_in: Arc::new(ease_in_quintic),
            ease_in_out: Arc::new(ease_in_out_quintic),
            ease_out: Arc::new(ease_out_quintic),
            halves_match: true,
            monotonic: true,
            name: "Quintic",
        },
        Family {
            ease_in: Arc::new(ease_in_sine),
            ease_in_out: Arc::new(ease_in_out_sine),
            ease_out: Arc::new(ease_out_sine),
            halves_match: true,
            monotonic: true,
            name: "Sine",
        },
    ];
}

fn samples() -> Vec<f32> {
    return (0..=200).map(|index| index as f32 / 200.0).collect();
}

// The TS suite runs in f64 and uses 1e-12; f32 arithmetic cannot resolve that, so this port uses
// an f32-appropriate bound that is still far below the smallest real defect the assertions target.
const RELATION_EPSILON: f32 = 1e-5;

// The closest TS-measured pair is Quadratic/Sine at 5.6e-2, so 0.005 separates families without
// accepting a copy-paste duplicate.
const SEPARATION_EPSILON: f32 = 0.005;

fn normalize_zero(value: f32) -> f32 {
    return if value == 0.0 { 0.0 } else { value };
}

fn assert_pairwise_distinct(curves: &[(&str, Ease)]) {
    let points = samples();
    for a in 0..curves.len() {
        for b in (a + 1)..curves.len() {
            let first = &curves[a].1;
            let second = &curves[b].1;
            let mut worst = 0.0_f32;
            for &t in &points {
                let separation = (first(t) - second(t)).abs();
                if separation > worst {
                    worst = separation;
                }
            }
            assert!(
                worst > SEPARATION_EPSILON,
                "{} and {} are not distinct: {worst}",
                curves[a].0,
                curves[b].0
            );
        }
    }
}

mod easing_family_distinctness {
    use super::*;

    #[test]
    fn ease_in_curves_are_pairwise_distinct() {
        let curves: Vec<(&str, Ease)> = families()
            .iter()
            .map(|family| (family.name, family.ease_in.clone()))
            .collect();
        assert_pairwise_distinct(&curves);
    }

    #[test]
    fn ease_in_out_curves_are_pairwise_distinct() {
        let curves: Vec<(&str, Ease)> = families()
            .iter()
            .map(|family| (family.name, family.ease_in_out.clone()))
            .collect();
        assert_pairwise_distinct(&curves);
    }

    #[test]
    fn ease_out_curves_are_pairwise_distinct() {
        let curves: Vec<(&str, Ease)> = families()
            .iter()
            .map(|family| (family.name, family.ease_out.clone()))
            .collect();
        assert_pairwise_distinct(&curves);
    }
}

mod easing_family_endpoints {
    use super::*;

    #[test]
    fn starts_at_exactly_0() {
        for family in families() {
            assert_eq!(
                normalize_zero((family.ease_in)(0.0)),
                0.0,
                "{} easeIn",
                family.name
            );
            assert_eq!(
                normalize_zero((family.ease_in_out)(0.0)),
                0.0,
                "{} easeInOut",
                family.name
            );
            assert!(
                (family.ease_out)(0.0).abs() < RELATION_EPSILON,
                "{} easeOut does not start at 0",
                family.name
            );
        }
    }

    #[test]
    fn ends_at_1_where_the_arithmetic_allows() {
        for family in families() {
            assert!(
                ((family.ease_out)(1.0) - 1.0).abs() < RELATION_EPSILON,
                "{} easeOut does not end at 1",
                family.name
            );
            assert!(
                ((family.ease_in_out)(1.0) - 1.0).abs() < RELATION_EPSILON,
                "{} easeInOut does not end at 1",
                family.name
            );
            assert!(
                ((family.ease_in)(1.0) - 1.0).abs() < RELATION_EPSILON,
                "{} easeIn does not end at 1",
                family.name
            );
        }
    }
}

mod easing_family_halves {
    use super::*;

    #[test]
    fn ease_in_out_matches_the_scaled_halves_where_the_constant_matches() {
        let points = samples();
        for family in families().into_iter().filter(|family| family.halves_match) {
            for &t in &points {
                let expected = if t <= 0.5 {
                    (family.ease_in)(t * 2.0) / 2.0
                } else {
                    0.5 + (family.ease_out)(t * 2.0 - 1.0) / 2.0
                };
                let actual = (family.ease_in_out)(t);
                assert!(
                    (actual - expected).abs() < RELATION_EPSILON,
                    "{} halves differ at {t}: {actual} vs {expected}",
                    family.name
                );
            }
        }
    }

    #[test]
    fn ease_in_out_deliberately_differs_where_the_canonical_constant_differs() {
        let points = samples();
        for family in families().into_iter().filter(|family| !family.halves_match) {
            let mut worst = 0.0_f32;
            for &t in points.iter().filter(|t| **t <= 0.5) {
                let difference = ((family.ease_in_out)(t) - (family.ease_in)(t * 2.0) / 2.0).abs();
                if difference > worst {
                    worst = difference;
                }
            }
            assert!(
                worst > 0.01,
                "{} unexpectedly matches its scaled halves",
                family.name
            );
        }
    }

    #[test]
    fn ease_in_out_passes_through_the_midpoint_without_a_step() {
        for family in families() {
            let midpoint = (family.ease_in_out)(0.5);
            assert!(
                (midpoint - 0.5).abs() < RELATION_EPSILON,
                "{} does not pass through 0.5",
                family.name
            );
            let wide = ((family.ease_in_out)(0.5 + 1e-4) - (family.ease_in_out)(0.5 - 1e-4)).abs();
            let narrow =
                ((family.ease_in_out)(0.5 + 1e-6) - (family.ease_in_out)(0.5 - 1e-6)).abs();
            assert!(
                narrow < (wide / 2.0).max(1e-9),
                "{} has a step at the midpoint",
                family.name
            );
        }
    }
}

mod easing_family_reflection {
    use super::*;

    #[test]
    fn ease_out_is_the_reflection_of_ease_in_across_the_interval() {
        let points = samples();
        for family in families() {
            for &t in &points {
                let reflected = 1.0 - (family.ease_in)(1.0 - t);
                let actual = (family.ease_out)(t);
                assert!(
                    (actual - reflected).abs() < RELATION_EPSILON,
                    "{} is not reflected at {t}: {actual} vs {reflected}",
                    family.name
                );
            }
        }
    }
}

mod easing_family_shape {
    use super::*;

    #[test]
    fn ease_in_never_steps_back_for_monotonic_families() {
        let points = samples();
        for family in families().into_iter().filter(|family| family.monotonic) {
            let mut previous = (family.ease_in)(points[0]);
            for &t in points.iter().skip(1) {
                let value = (family.ease_in)(t);
                assert!(
                    value >= previous - RELATION_EPSILON,
                    "{} steps back at {t}",
                    family.name
                );
                previous = value;
            }
        }
    }

    #[test]
    fn back_and_elastic_overshoot_the_unit_interval() {
        let points = samples();
        for name in ["Back", "Elastic"] {
            let family = families()
                .into_iter()
                .find(|family| family.name == name)
                .expect("family exists");
            let minimum = points
                .iter()
                .map(|&t| (family.ease_in)(t))
                .fold(f32::INFINITY, f32::min);
            let maximum = points
                .iter()
                .map(|&t| (family.ease_out)(t))
                .fold(f32::NEG_INFINITY, f32::max);
            assert!(minimum < -0.05, "{name} easeIn does not dip below 0");
            assert!(maximum > 1.05, "{name} easeOut does not rise above 1");
        }
    }

    #[test]
    fn bounce_reverses_without_leaving_the_unit_interval() {
        let points = samples();
        let values: Vec<f32> = points.iter().map(|&t| ease_in_bounce(t)).collect();
        assert!(values.iter().all(|value| *value >= 0.0 && *value <= 1.0));
        assert!(
            values.windows(2).any(|pair| pair[1] < pair[0]),
            "Bounce must reverse somewhere"
        );
    }
}
