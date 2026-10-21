use std::sync::{Arc, RwLock};

use flight_animation::contract::{
    AnimationChannel, AnimationInterpolation, CreateAnimationTrackOpts, create_animation_channel,
    create_animation_track,
};
use flight_entity::Unknown;
use flight_node::contract::{
    NodeOrderList, NodeRef, add_node_child, apply_node_order_list, create_node_order_list,
    get_node_child_at,
};
use flight_skeleton2d::contract::*;

use crate::support::*;

fn order_list() -> RefOrderList {
    return Arc::new(RwLock::new(create_node_order_list()));
}

type RefOrderList = std::sync::Arc<std::sync::RwLock<NodeOrderList>>;

fn rig(count: usize) -> (NodeRef, Vec<NodeRef>, RefOrderList) {
    let parent = test_node();
    let mut nodes = Vec::new();
    for _ in 0..count {
        let node = test_node();
        add_node_child(&parent, &node);
        nodes.push(node);
    }
    return (parent, nodes, order_list());
}

fn bind(
    nodes: &[Option<NodeRef>],
    list: &RefOrderList,
    times: Vec<f32>,
    values: Vec<f32>,
    components: usize,
    interpolation: AnimationInterpolation,
    time: f32,
    guards: &Skeleton2DGuardState,
) {
    let mut registry = create_skeleton_2d_animation_target_registry();
    register_skeleton_2d_draw_order_animation_binder(&mut registry);
    let target = create_skeleton_2d_draw_order_animation_target(nodes, list);
    let target_unknown: Unknown = Some(Arc::new(target));
    let track = create_animation_track(CreateAnimationTrackOpts {
        times,
        values,
        components: Some(components),
        interpolation: Some(interpolation),
        quaternion: None,
        easing: None,
        segment_easings: None,
    });
    let handle = create_skeleton_2d_animation_target_handle(
        SKELETON_2D_ANIMATION_TARGET_KIND_DRAW_ORDER,
        target_unknown.clone(),
    );
    let channel = create_animation_channel(track, Some(Arc::new(handle)));
    let bind = get_skeleton_2d_animation_target_binder(
        &registry,
        SKELETON_2D_ANIMATION_TARGET_KIND_DRAW_ORDER,
    )
    .expect("draw-order binder");
    let setup = skeleton(vec![bone()], None);
    let mut pose = clone_skeleton_2d(&setup);
    bind(&channel, &setup, &mut pose, &target_unknown, time, guards);
}

mod create_skeleton_2d_draw_order_animation_target {
    use super::*;

    #[test]
    fn stamps_the_kind_the_binder_dispatches_on() {
        let (_, nodes, list) = rig(0);
        let options: Vec<Option<NodeRef>> = nodes.into_iter().map(Some).collect();
        let target = create_skeleton_2d_draw_order_animation_target(&options, &list);
        assert_eq!(target.kind, SKELETON_2D_ANIMATION_TARGET_KIND_DRAW_ORDER);
    }
}

mod create_skeleton_2d_draw_order_channel {
    use super::*;

    fn channel_of(
        timeline: &Skeleton2DDrawOrderTimeline,
        nodes: &[Option<NodeRef>],
        list: &RefOrderList,
    ) -> AnimationChannel {
        return create_skeleton_2d_draw_order_channel(timeline, nodes, list).expect("channel");
    }

    fn target_handle(channel: &AnimationChannel) -> &Skeleton2DAnimationTargetHandle {
        return channel
            .target_ref
            .as_ref()
            .and_then(|handle| handle.downcast_ref::<Skeleton2DAnimationTargetHandle>())
            .expect("handle");
    }

    #[test]
    fn builds_a_step_track_whose_components_are_the_slot_count() {
        let (_, nodes, list) = rig(3);
        let options: Vec<Option<NodeRef>> = nodes.into_iter().map(Some).collect();
        let timeline = Skeleton2DDrawOrderTimeline {
            orderings: vec![0.0, 1.0, 2.0, 2.0, 0.0, 1.0],
            times: vec![0.0, 1.0],
        };
        let channel = channel_of(&timeline, &options, &list);
        assert_eq!(channel.track.components, 3);
        assert_eq!(channel.track.interpolation, AnimationInterpolation::Step);
    }

    #[test]
    fn builds_the_track_as_step_so_the_coercion_guard_has_nothing_to_report() {
        let (_, nodes, list) = rig(2);
        let options: Vec<Option<NodeRef>> = nodes.into_iter().map(Some).collect();
        let timeline = Skeleton2DDrawOrderTimeline {
            orderings: vec![0.0, 1.0, 1.0, 0.0],
            times: vec![0.0, 1.0],
        };
        let channel = channel_of(&timeline, &options, &list);
        let (guards, reports) = recording_coerced_guards();
        let mut registry = create_skeleton_2d_animation_target_registry();
        register_skeleton_2d_draw_order_animation_binder(&mut registry);
        let handle = target_handle(&channel);
        let bind = get_skeleton_2d_animation_target_binder(
            &registry,
            SKELETON_2D_ANIMATION_TARGET_KIND_DRAW_ORDER,
        )
        .expect("draw-order binder");
        let setup = skeleton(vec![bone()], None);
        let mut pose = clone_skeleton_2d(&setup);
        bind(&channel, &setup, &mut pose, &handle.target, 1.0, &guards);
        assert!(reports.lock().unwrap().is_empty());
        let list = list.read().unwrap();
        assert_eq!(&list.sort_keys[..2], &[1.0, 0.0]);
    }

    #[test]
    fn stamps_the_target_so_the_channel_binds_without_further_wiring() {
        let (_, nodes, list) = rig(2);
        let options: Vec<Option<NodeRef>> = nodes.into_iter().map(Some).collect();
        let timeline = Skeleton2DDrawOrderTimeline {
            orderings: vec![0.0, 1.0],
            times: vec![0.0],
        };
        let channel = channel_of(&timeline, &options, &list);
        assert_eq!(
            target_handle(&channel).kind,
            SKELETON_2D_ANIMATION_TARGET_KIND_DRAW_ORDER
        );
    }

    #[test]
    fn returns_none_for_a_timeline_with_no_keyframes() {
        let (_, nodes, list) = rig(2);
        let options: Vec<Option<NodeRef>> = nodes.into_iter().map(Some).collect();
        let timeline = Skeleton2DDrawOrderTimeline {
            orderings: Vec::new(),
            times: Vec::new(),
        };
        assert!(create_skeleton_2d_draw_order_channel(&timeline, &options, &list).is_none());
    }

    #[test]
    fn returns_none_when_the_orderings_are_not_a_whole_number_of_per_keyframe_orderings() {
        let (_, nodes, list) = rig(2);
        let options: Vec<Option<NodeRef>> = nodes.into_iter().map(Some).collect();
        let timeline = Skeleton2DDrawOrderTimeline {
            orderings: vec![0.0, 1.0, 1.0],
            times: vec![0.0, 1.0],
        };
        assert!(create_skeleton_2d_draw_order_channel(&timeline, &options, &list).is_none());
    }
}

mod initialize_skeleton_2d_draw_order_animation_target {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_the_constructor() {
        let (_, nodes, list) = rig(1);
        let options: Vec<Option<NodeRef>> = nodes.into_iter().map(Some).collect();
        let mut out: Skeleton2DDrawOrderAnimationTarget = flight_entity::allocate_entity();
        initialize_skeleton_2d_draw_order_animation_target(&mut out, &options, &list);
        let created = create_skeleton_2d_draw_order_animation_target(&options, &list);
        assert_eq!(out.kind, created.kind);
        assert_eq!(out.nodes.len(), created.nodes.len());
        assert!(Arc::ptr_eq(&out.order_list, &created.order_list));
    }
}

mod register_skeleton_2d_draw_order_animation_binder {
    use super::*;

    #[test]
    fn claims_nothing_until_called_so_an_unused_family_shakes_out() {
        let registry = create_skeleton_2d_animation_target_registry();
        assert!(
            get_skeleton_2d_animation_target_binder(
                &registry,
                SKELETON_2D_ANIMATION_TARGET_KIND_DRAW_ORDER
            )
            .is_none()
        );
    }

    #[test]
    fn claims_the_draw_order_kind_once_called() {
        let mut registry = create_skeleton_2d_animation_target_registry();
        register_skeleton_2d_draw_order_animation_binder(&mut registry);
        assert!(
            get_skeleton_2d_animation_target_binder(
                &registry,
                SKELETON_2D_ANIMATION_TARGET_KIND_DRAW_ORDER
            )
            .is_some()
        );
    }

    #[test]
    fn writes_the_ordering_the_keyframe_states_into_the_caller_list() {
        let (_, nodes, list) = rig(3);
        let options: Vec<Option<NodeRef>> = nodes.into_iter().map(Some).collect();
        bind(
            &options,
            &list,
            vec![0.0, 1.0],
            vec![0.0, 1.0, 2.0, 2.0, 0.0, 1.0],
            3,
            AnimationInterpolation::Step,
            1.0,
            &empty_guards(),
        );
        let list = list.read().unwrap();
        assert_eq!(list.entry_count, 3);
        assert_eq!(&list.sort_keys[..3], &[2.0, 0.0, 1.0]);
    }

    #[test]
    fn holds_the_first_keyframe_before_the_track_starts() {
        let (_, nodes, list) = rig(2);
        let options: Vec<Option<NodeRef>> = nodes.into_iter().map(Some).collect();
        bind(
            &options,
            &list,
            vec![5.0, 9.0],
            vec![0.0, 1.0, 1.0, 0.0],
            2,
            AnimationInterpolation::Step,
            0.0,
            &empty_guards(),
        );
        let list = list.read().unwrap();
        assert_eq!(&list.sort_keys[..2], &[0.0, 1.0]);
    }

    #[test]
    fn steps_rather_than_blending_between_two_orderings() {
        let (_, nodes, list) = rig(2);
        let options: Vec<Option<NodeRef>> = nodes.into_iter().map(Some).collect();
        bind(
            &options,
            &list,
            vec![0.0, 1.0],
            vec![0.0, 1.0, 1.0, 0.0],
            2,
            AnimationInterpolation::Step,
            0.5,
            &empty_guards(),
        );
        let list = list.read().unwrap();
        assert_eq!(&list.sort_keys[..2], &[0.0, 1.0]);
    }

    #[test]
    fn reports_the_coercion_when_the_track_claims_it_can_be_interpolated() {
        let (guards, reports) = recording_coerced_guards();
        let (_, nodes, list) = rig(2);
        let options: Vec<Option<NodeRef>> = nodes.into_iter().map(Some).collect();
        bind(
            &options,
            &list,
            vec![0.0, 1.0],
            vec![0.0, 1.0, 1.0, 0.0],
            2,
            AnimationInterpolation::Linear,
            1.0,
            &guards,
        );
        assert_eq!(
            *reports.lock().unwrap(),
            vec![String::from("DrawOrder:Linear")]
        );
        let list = list.read().unwrap();
        assert_eq!(&list.sort_keys[..2], &[1.0, 0.0]);
    }

    #[test]
    fn says_nothing_when_the_track_already_states_steps() {
        let (guards, reports) = recording_coerced_guards();
        let (_, nodes, list) = rig(2);
        let options: Vec<Option<NodeRef>> = nodes.into_iter().map(Some).collect();
        bind(
            &options,
            &list,
            vec![0.0, 1.0],
            vec![0.0, 1.0, 1.0, 0.0],
            2,
            AnimationInterpolation::Step,
            1.0,
            &guards,
        );
        assert!(reports.lock().unwrap().is_empty());
    }

    #[test]
    fn orders_only_the_slots_the_track_states_leaving_later_nodes_out() {
        let (parent, nodes, list) = rig(3);
        let options: Vec<Option<NodeRef>> = nodes.iter().cloned().map(Some).collect();
        bind(
            &options,
            &list,
            vec![0.0],
            vec![1.0, 0.0],
            2,
            AnimationInterpolation::Step,
            0.0,
            &empty_guards(),
        );
        {
            let list_guard = list.read().unwrap();
            assert_eq!(list_guard.entry_count, 2);
        }
        apply_node_order_list(&parent, &list.read().unwrap());
        let first = get_node_child_at(&parent, 0).expect("child");
        let second = get_node_child_at(&parent, 1).expect("child");
        let third = get_node_child_at(&parent, 2).expect("child");
        assert!(Arc::ptr_eq(&first, &nodes[1]));
        assert!(Arc::ptr_eq(&second, &nodes[0]));
        assert!(Arc::ptr_eq(&third, &nodes[2]));
    }

    #[test]
    fn skips_a_slot_that_draws_nothing_rather_than_entering_a_placeholder() {
        let drawn = test_node();
        let list = order_list();
        let node_options = vec![None, Some(drawn.clone())];
        bind(
            &node_options,
            &list,
            vec![0.0],
            vec![1.0, 0.0],
            2,
            AnimationInterpolation::Step,
            0.0,
            &empty_guards(),
        );
        let list_guard = list.read().unwrap();
        assert_eq!(list_guard.entry_count, 1);
        assert!(Arc::ptr_eq(&list_guard.nodes[0], &drawn));
    }

    #[test]
    fn permutes_the_parent_children_once_the_caller_applies_the_list() {
        let (parent, nodes, list) = rig(3);
        let options: Vec<Option<NodeRef>> = nodes.iter().cloned().map(Some).collect();
        bind(
            &options,
            &list,
            vec![0.0],
            vec![2.0, 0.0, 1.0],
            3,
            AnimationInterpolation::Step,
            0.0,
            &empty_guards(),
        );
        apply_node_order_list(&parent, &list.read().unwrap());
        let first = get_node_child_at(&parent, 0).expect("child");
        let second = get_node_child_at(&parent, 1).expect("child");
        let third = get_node_child_at(&parent, 2).expect("child");
        assert!(Arc::ptr_eq(&first, &nodes[1]));
        assert!(Arc::ptr_eq(&second, &nodes[2]));
        assert!(Arc::ptr_eq(&third, &nodes[0]));
    }
}

mod unregister_skeleton_2d_draw_order_animation_binder {
    use super::*;

    #[test]
    fn releases_the_kind_again() {
        let mut registry = create_skeleton_2d_animation_target_registry();
        register_skeleton_2d_draw_order_animation_binder(&mut registry);
        unregister_skeleton_2d_draw_order_animation_binder(&mut registry);
        assert!(
            get_skeleton_2d_animation_target_binder(
                &registry,
                SKELETON_2D_ANIMATION_TARGET_KIND_DRAW_ORDER
            )
            .is_none()
        );
    }
}
