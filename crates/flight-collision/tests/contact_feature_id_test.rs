use flight_collision::*;
use flight_collision::contract::*;
use std::collections::HashMap;

mod pack_contact_feature_id {
    use super::*;

    #[test]
    fn separates_the_exact_face_pairs_the_previous_shift_packing_aliased() {
        // The reported regression, stated as arithmetic rather than hoped for through geometry: shifting an
        // unmasked incident index left by 1 into a 10-bit field spilled it into the reference field, so face
        // pair (0, 1024) and face pair (1, 0) produced one id. A solver keyed on that id would warm-start
        // one contact with an impulse belonging to a different pair of faces entirely.
        assert_eq!((0 << 11) | (1024 << 1), (1 << 11) | (0 << 1)); // the old collision
        assert_ne!(
            pack_contact_feature_id(true, 0, 1024, false),
            pack_contact_feature_id(true, 1, 0, false)
        );
    }

    #[test]
    fn gives_every_distinct_feature_its_own_id_across_the_packing_boundaries() {
        // Sweeps each field across the values where a fixed-width packing wraps -- its own boundary and the
        // one below it -- and checks the whole cross product collides nowhere.
        let edges: Vec<i64> = vec![0, 1, 2, 1023, 1024, 1025, 2047, 2048, FEATURE_INDEX_LIMIT - 1];
        let mut seen: HashMap<i64, String> = HashMap::new();
        for &reference_is_a in &[false, true] {
            for &reference_edge in &edges {
                for &incident_edge in &edges {
                    for &second_point in &[false, true] {
                        let id = pack_contact_feature_id(
                            reference_is_a,
                            reference_edge,
                            incident_edge,
                            second_point,
                        );
                        let key = format!(
                            "{}/{}/{}/{}",
                            reference_is_a, reference_edge, incident_edge, second_point
                        );
                        assert!(
                            !seen.contains_key(&id),
                            "collision: id {} already seen as {:?}, now {}",
                            id,
                            seen.get(&id),
                            key
                        );
                        seen.insert(id, key);
                    }
                }
            }
        }
        assert_eq!(seen.len(), 2 * edges.len() * edges.len() * 2);
    }

    #[test]
    fn stays_an_exactly_representable_integer_at_the_widest_packing() {
        // Every id must survive as an exact integer: one rounded id is two features sharing an identity.
        // In Rust i64, all values are exact integers, so we verify the widest packing is well-formed.
        let widest = pack_contact_feature_id(
            true,
            FEATURE_INDEX_LIMIT - 1,
            FEATURE_INDEX_LIMIT - 1,
            true,
        );
        assert!(widest > 0);
        assert_ne!(widest + 1, widest);
    }

    #[test]
    fn distinguishes_the_two_contact_points_of_one_face_pair() {
        assert_ne!(
            pack_contact_feature_id(true, 3, 7, false),
            pack_contact_feature_id(true, 3, 7, true)
        );
    }

    #[test]
    fn distinguishes_which_shape_owned_the_reference_face() {
        assert_ne!(
            pack_contact_feature_id(false, 3, 7, false),
            pack_contact_feature_id(true, 3, 7, false)
        );
    }
}
