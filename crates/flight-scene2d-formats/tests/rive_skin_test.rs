use flight_importdiagnostics::ImportDiagnostic;
use flight_scene2d_formats::contract::*;

const BONE_ID: u64 = 95;
const CUBIC_DETACHED_VERTEX: u64 = 6;
const CUBIC_WEIGHT: u64 = 46;
const IN_INDICES: u64 = 111;
const IN_VALUES: u64 = 110;
const INDICES: u64 = 103;
const OUT_INDICES: u64 = 113;
const OUT_VALUES: u64 = 112;
const POINTS_PATH: u64 = 16;
const SKIN: u64 = 43;
const SKIN_TX: u64 = 108;
const SKIN_TY: u64 = 109;
const STRAIGHT_VERTEX: u64 = 5;
const TENDON: u64 = 44;
const TENDON_TX: u64 = 100;
const TENDON_TY: u64 = 101;
const VALUES: u64 = 102;
const WEIGHT: u64 = 45;

mod create_rive_skin_2d {
    use super::*;

    #[test]
    fn gives_a_cubic_handle_the_influences_it_states_rather_than_its_anchor_own() {
        let artboard = cubic_skinned_path();
        let points = [
            weighted_point(RiveWeightedPointKind::Point, 4, 0.0, 0.0),
            weighted_point(RiveWeightedPointKind::In, 4, 0.0, 0.0),
            weighted_point(RiveWeightedPointKind::Out, 4, 0.0, 0.0),
        ];
        let result = create_rive_skin_2d(&artboard, 0, &[-1, -1, -1, 0, 1, -1], &points, None)
            .expect("skin");
        assert_eq!(result.influence_counts, [1, 1, 1]);
        assert_eq!(result.influences[0], 0.0);
        assert_eq!(result.influences[4], 1.0);
        assert!((result.influences[11] - 128.0 / 255.0).abs() < 1e-6);
    }

    #[test]
    fn gives_a_plain_weight_no_handle_influences_rather_than_reusing_its_anchor_pair() {
        let fixture = skinned_path(&[(VALUES, 0x00ff), (INDICES, 0x0001)], 0.0, 0.0);
        let points = [weighted_point(RiveWeightedPointKind::In, 4, 0.0, 0.0)];
        let result = create_rive_skin_2d(
            &fixture.artboard,
            fixture.skinnable,
            &fixture.bones,
            &points,
            None,
        )
        .expect("skin");
        assert_eq!(result.influence_counts[0], 0);
        assert!(result.influences.is_empty());
    }

    #[test]
    fn puts_the_offset_into_bone_space_by_inverting_the_tendon_bind() {
        let fixture = skinned_path(&[(VALUES, 0x00ff), (INDICES, 0x0001)], 5.0, 0.0);
        let result = run_skin(&fixture, None).expect("skin");
        assert!((result.influences[1] - 75.0).abs() < 1e-5);
        assert!(result.influences[2].abs() < 1e-5);
    }

    #[test]
    fn reads_the_index_as_a_tendon_number_starting_at_one_not_as_a_bone_index() {
        let fixture = skinned_path(&[(VALUES, 0x00ff), (INDICES, 0x0002)], 0.0, 0.0);
        let result = run_skin(&fixture, None).expect("skin");
        assert_eq!(result.influences[0], 1.0);
    }

    #[test]
    fn reports_an_influence_naming_a_tendon_the_skin_does_not_have() {
        let fixture = skinned_path(&[(VALUES, 0x00ff), (INDICES, 0x0009)], 0.0, 0.0);
        let mut diagnostics = Vec::new();
        let _ = run_skin(&fixture, Some(&mut diagnostics));
        assert_eq!(
            diagnostic_kinds(&diagnostics),
            ["rive.unresolved-weight-bone"]
        );
    }

    #[test]
    fn reports_an_influence_naming_the_identity_slot_instead_of_dropping_it_silently() {
        let fixture = skinned_path(&[(VALUES, 0x00ff), (INDICES, 0x0000)], 0.0, 0.0);
        let mut diagnostics = Vec::new();
        let result = run_skin(&fixture, Some(&mut diagnostics)).expect("skin");
        assert_eq!(result.influence_counts[0], 0);
        assert_eq!(
            diagnostic_kinds(&diagnostics),
            ["rive.unresolved-weight-bone"]
        );
    }

    #[test]
    fn returns_none_for_a_path_that_carries_no_skin() {
        let artboard = graph(vec![object(POINTS_PATH, &[])], vec![-1]);
        assert!(
            create_rive_skin_2d(
                &artboard,
                0,
                &[0],
                &[weighted_point(RiveWeightedPointKind::Point, 0, 0.0, 0.0)],
                None,
            )
            .is_none()
        );
    }

    #[test]
    fn treats_a_zero_weight_as_an_unused_slot_rather_than_a_real_influence() {
        let fixture = skinned_path(&[(VALUES, 0x00ff), (INDICES, 0x0201)], 0.0, 0.0);
        let result = run_skin(&fixture, None).expect("skin");
        assert_eq!(result.influence_counts[0], 1);
        assert_eq!(result.influences.len(), 4);
    }

    #[test]
    fn unpacks_four_influences_from_one_word_low_byte_first() {
        let fixture = skinned_path(&[(VALUES, 0x7f80), (INDICES, 0x0201)], 0.0, 0.0);
        let result = run_skin(&fixture, None).expect("skin");
        assert_eq!(result.influence_counts[0], 2);
        assert_eq!(result.influences[0], 0.0);
        assert!((result.influences[3] - 128.0 / 255.0).abs() < 1e-6);
        assert_eq!(result.influences[4], 1.0);
        assert!((result.influences[7] - 127.0 / 255.0).abs() < 1e-6);
    }
}

struct SkinFixture {
    artboard: RiveArtboardGraph,
    bones: Vec<i32>,
    points: Vec<RiveWeightedPoint>,
    skinnable: usize,
}

fn cubic_skinned_path() -> RiveArtboardGraph {
    return graph(
        vec![
            object(POINTS_PATH, &[]),
            object(SKIN, &[]),
            object(TENDON, &[(BONE_ID, 3)]),
            object(TENDON, &[(BONE_ID, 4)]),
            object(CUBIC_DETACHED_VERTEX, &[]),
            object(
                CUBIC_WEIGHT,
                &[
                    (VALUES, 0x00ff),
                    (INDICES, 0x0001),
                    (IN_VALUES, 0x00ff),
                    (IN_INDICES, 0x0002),
                    (OUT_VALUES, 0x0080),
                    (OUT_INDICES, 0x0001),
                ],
            ),
        ],
        vec![-1, 0, 1, 1, 0, 4],
    );
}

fn diagnostic_kinds(diagnostics: &[ImportDiagnostic]) -> Vec<&str> {
    return diagnostics
        .iter()
        .map(|diagnostic| diagnostic.kind.as_str())
        .collect();
}

fn graph(objects: Vec<RiveCoreObject>, parent_indices: Vec<i32>) -> RiveArtboardGraph {
    return RiveArtboardGraph {
        stream_end: objects.len(),
        objects,
        parent_indices,
        stream_start: 0,
    };
}

fn object(type_key: u64, properties: &[(u64, u32)]) -> RiveCoreObject {
    return RiveCoreObject {
        properties: properties
            .iter()
            .map(|(key, value)| RiveProperty {
                key: *key,
                r#type: RiveFieldType::Double,
                value: RiveValue::Double(*value as f32),
            })
            .collect(),
        type_key,
    };
}

fn run_skin(
    fixture: &SkinFixture,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<flight_skeleton2d::contract::Skin2D> {
    return create_rive_skin_2d(
        &fixture.artboard,
        fixture.skinnable,
        &fixture.bones,
        &fixture.points,
        diagnostics,
    );
}

fn skinned_path(weight: &[(u64, u32)], x: f32, y: f32) -> SkinFixture {
    return SkinFixture {
        artboard: graph(
            vec![
                object(POINTS_PATH, &[]),
                object(SKIN, &[(SKIN_TX, 100), (SKIN_TY, 0)]),
                object(TENDON, &[(BONE_ID, 3), (TENDON_TX, 30), (TENDON_TY, 0)]),
                object(TENDON, &[(BONE_ID, 4), (TENDON_TX, 0), (TENDON_TY, 0)]),
                object(STRAIGHT_VERTEX, &[]),
                object(WEIGHT, weight),
            ],
            vec![-1, 0, 1, 1, 0, 4],
        ),
        bones: vec![-1, -1, -1, 0, 1, -1],
        points: vec![weighted_point(RiveWeightedPointKind::Point, 4, x, y)],
        skinnable: 0,
    };
}

fn weighted_point(kind: RiveWeightedPointKind, vertex: usize, x: f32, y: f32) -> RiveWeightedPoint {
    return RiveWeightedPoint { kind, vertex, x, y };
}
