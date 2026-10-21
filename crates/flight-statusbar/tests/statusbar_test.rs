use std::any::Any;
use std::sync::{Arc, Mutex};

use flight_signals::connect_signal;
use flight_statusbar::contract::*;

/// Calls recorded by one fake host's command providers.
struct Calls {
    background_color: Vec<(u32, Option<bool>)>,
    overlays_content: Vec<bool>,
    style: Vec<StatusBarStyle>,
    visible: Vec<(bool, Option<StatusBarAnimation>)>,
    unsubscribes: usize,
}

/// One fake host (TS `fakeHost`): a single provider object behind every facet, a settable change
/// listener, and recorded command calls.
struct FakeHost {
    calls: Arc<Mutex<Calls>>,
    listener: Arc<Mutex<Option<StatusBarChangeListener>>>,
    change: HostStatusBarChangeCapability,
    color: HostStatusBarColorCapability,
    info: HostStatusBarInfoCapability,
    overlays: HostStatusBarOverlaysCapability,
    style: HostStatusBarStyleCapability,
    visibility: HostStatusBarVisibilityCapability,
}

impl FakeHost {
    fn emit(&self) {
        let listener = self.listener.lock().unwrap().clone();
        if let Some(listener) = listener {
            listener();
        }
    }
}

fn fake_host(initial_style: StatusBarStyle) -> FakeHost {
    let provider: Arc<dyn Any + Send + Sync> = Arc::new(());
    let calls = Arc::new(Mutex::new(Calls {
        background_color: Vec::new(),
        overlays_content: Vec::new(),
        style: Vec::new(),
        visible: Vec::new(),
        unsubscribes: 0,
    }));
    let listener: Arc<Mutex<Option<StatusBarChangeListener>>> = Arc::new(Mutex::new(None));
    let (l, c) = (listener.clone(), calls.clone());
    let change = HostStatusBarChangeCapability {
        provider: provider.clone(),
        subscribe: Arc::new(move |next: StatusBarChangeListener| {
            *l.lock().unwrap() = Some(next);
            let (l, c) = (l.clone(), c.clone());
            let release: StatusBarUnsubscribe = Arc::new(move || {
                *l.lock().unwrap() = None;
                c.lock().unwrap().unsubscribes += 1;
            });
            return release;
        }),
    };
    let c = calls.clone();
    let color = HostStatusBarColorCapability {
        provider: provider.clone(),
        set_background_color: Arc::new(move |color: u32, animated: Option<bool>| {
            c.lock().unwrap().background_color.push((color, animated))
        }),
    };
    let info = HostStatusBarInfoCapability {
        provider: provider.clone(),
        get_info: Arc::new(move |out: &mut StatusBarInfo| {
            out.color = 0;
            out.height = 20.0;
            out.overlays_content = false;
            out.style = initial_style;
            out.visible = true;
        }),
    };
    let c = calls.clone();
    let overlays = HostStatusBarOverlaysCapability {
        provider: provider.clone(),
        set_overlays_content: Arc::new(move |overlay: bool| {
            c.lock().unwrap().overlays_content.push(overlay)
        }),
    };
    let c = calls.clone();
    let style = HostStatusBarStyleCapability {
        provider: provider.clone(),
        set_style: Arc::new(move |style: StatusBarStyle| c.lock().unwrap().style.push(style)),
    };
    let c = calls.clone();
    let visibility = HostStatusBarVisibilityCapability {
        provider,
        set_visible: Arc::new(
            move |visible: bool, animation: Option<StatusBarAnimation>| {
                c.lock().unwrap().visible.push((visible, animation))
            },
        ),
    };
    return FakeHost {
        calls,
        listener,
        change,
        color,
        info,
        overlays,
        style,
        visibility,
    };
}

fn push(
    stacks: &mut StatusBarStyleStacks,
    host: &FakeHost,
    entry: StatusBarStyleEntry,
) -> StatusBarStyleEntryHandle {
    return push_status_bar_style_entry(
        stacks,
        &host.color,
        &host.info,
        &host.overlays,
        &host.style,
        &host.visibility,
        &entry,
    );
}

fn style_entry(style: StatusBarStyle) -> StatusBarStyleEntry {
    return StatusBarStyleEntry {
        animation: None,
        color: None,
        overlays_content: None,
        style: Some(style),
        visible: None,
    };
}

mod attach_status_bar {
    use super::*;

    #[test]
    fn pins_both_event_and_snapshot_providers_at_attachment_time() {
        let first = fake_host(StatusBarStyle::Light);
        let second = fake_host(StatusBarStyle::Dark);
        let mut bar = create_status_bar();
        let seen: Arc<Mutex<Vec<StatusBarStyle>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        connect_signal(
            &bar.on_change,
            Arc::new(move |info: &StatusBarInfo| sink.lock().unwrap().push(info.style)),
            None,
        );
        attach_status_bar(&first.change, &first.info, &mut bar);
        first.emit();
        attach_status_bar(&second.change, &second.info, &mut bar);
        first.emit();
        second.emit();
        assert_eq!(first.calls.lock().unwrap().unsubscribes, 1);
        assert_eq!(
            *seen.lock().unwrap(),
            vec![StatusBarStyle::Light, StatusBarStyle::Dark]
        );
    }

    #[test]
    fn emits_a_fresh_snapshot_per_event() {
        let host = fake_host(StatusBarStyle::Light);
        let mut bar = create_status_bar();
        let seen: Arc<Mutex<Vec<usize>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        connect_signal(
            &bar.on_change,
            Arc::new(move |info: &StatusBarInfo| sink.lock().unwrap().push(info.height as usize)),
            None,
        );
        attach_status_bar(&host.change, &host.info, &mut bar);
        host.emit();
        host.emit();
        assert_eq!(*seen.lock().unwrap(), vec![20, 20]);
    }
}

mod clear_status_bar_style_stack {
    use super::*;

    #[test]
    fn restores_only_the_passed_host_baseline() {
        let first = fake_host(StatusBarStyle::Light);
        let second = fake_host(StatusBarStyle::Dark);
        let mut stacks = create_status_bar_style_stacks();
        push(&mut stacks, &first, style_entry(StatusBarStyle::Dark));
        push(&mut stacks, &second, style_entry(StatusBarStyle::Light));
        clear_status_bar_style_stack(&mut stacks, &first.info);
        assert_eq!(
            first.calls.lock().unwrap().style.last(),
            Some(&StatusBarStyle::Light)
        );
        assert_eq!(second.calls.lock().unwrap().style.len(), 1);
    }

    #[test]
    fn is_a_no_op_for_a_provider_without_a_stack() {
        let host = fake_host(StatusBarStyle::Light);
        let mut stacks = create_status_bar_style_stacks();
        clear_status_bar_style_stack(&mut stacks, &host.info);
        assert!(host.calls.lock().unwrap().style.is_empty());
    }
}

mod create_status_bar {
    use super::*;

    #[test]
    fn creates_an_inert_signal_entity() {
        let bar = create_status_bar();
        let _: &dyn flight_entity::Entity = &bar;
        assert!(!flight_signals::has_signal_slots(&bar.on_change));
    }
}

mod create_status_bar_info {
    use super::*;

    #[test]
    fn creates_the_documented_unknown_default_snapshot() {
        let info = create_status_bar_info();
        assert_eq!(info.color, 0);
        assert_eq!(info.height, -1.0);
        assert!(!info.overlays_content);
        assert_eq!(info.style, StatusBarStyle::Default);
        assert!(info.visible);
    }
}

mod create_status_bar_style_stacks {
    use super::*;

    #[test]
    fn starts_empty_with_handles_from_one() {
        let host = fake_host(StatusBarStyle::Light);
        let mut stacks = create_status_bar_style_stacks();
        assert!(!has_status_bar_style_entry(&stacks, &host.info, 1));
        assert_eq!(
            push(&mut stacks, &host, style_entry(StatusBarStyle::Dark)),
            1
        );
    }
}

mod detach_status_bar {
    use super::*;

    #[test]
    fn releases_the_exact_attached_provider_once() {
        let host = fake_host(StatusBarStyle::Light);
        let mut bar = create_status_bar();
        attach_status_bar(&host.change, &host.info, &mut bar);
        detach_status_bar(&mut bar);
        detach_status_bar(&mut bar);
        assert_eq!(host.calls.lock().unwrap().unsubscribes, 1);
    }
}

mod dispose_status_bar {
    use super::*;

    #[test]
    fn detaches_its_subscription() {
        let host = fake_host(StatusBarStyle::Light);
        let mut bar = create_status_bar();
        attach_status_bar(&host.change, &host.info, &mut bar);
        dispose_status_bar(&mut bar);
        assert_eq!(host.calls.lock().unwrap().unsubscribes, 1);
    }
}

mod get_status_bar_animation_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_status_bar_animation_string(StatusBarAnimation::None),
            "none"
        );
        assert_eq!(
            get_status_bar_animation_string(StatusBarAnimation::Fade),
            "fade"
        );
        assert_eq!(
            get_status_bar_animation_string(StatusBarAnimation::Slide),
            "slide"
        );
    }
}

mod get_status_bar_height {
    use super::*;

    #[test]
    fn reads_from_the_passed_host() {
        assert_eq!(
            get_status_bar_height(&fake_host(StatusBarStyle::Light).info),
            20.0
        );
    }
}

mod get_status_bar_info {
    use super::*;

    #[test]
    fn fills_the_caller_out_object() {
        let mut out = create_status_bar_info();
        get_status_bar_info(&mut out, &fake_host(StatusBarStyle::Dark).info);
        assert_eq!(out.style, StatusBarStyle::Dark);
        assert_eq!(out.height, 20.0);
    }
}

mod get_status_bar_style_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(get_status_bar_style_string(StatusBarStyle::Light), "light");
        assert_eq!(get_status_bar_style_string(StatusBarStyle::Dark), "dark");
        assert_eq!(
            get_status_bar_style_string(StatusBarStyle::Default),
            "default"
        );
    }
}

mod has_status_bar_style_entry {
    use super::*;

    #[test]
    fn tracks_handles_within_one_explicit_host() {
        let host = fake_host(StatusBarStyle::Light);
        let mut stacks = create_status_bar_style_stacks();
        let handle = push(&mut stacks, &host, style_entry(StatusBarStyle::Dark));
        assert!(has_status_bar_style_entry(&stacks, &host.info, handle));
        pop_status_bar_style_entry(&mut stacks, &host.info, handle);
        assert!(!has_status_bar_style_entry(&stacks, &host.info, handle));
    }

    #[test]
    fn is_false_for_the_invalid_sentinel_and_for_another_hosts_handle() {
        let first = fake_host(StatusBarStyle::Light);
        let second = fake_host(StatusBarStyle::Light);
        let mut stacks = create_status_bar_style_stacks();
        let handle = push(&mut stacks, &first, style_entry(StatusBarStyle::Dark));
        push(&mut stacks, &second, style_entry(StatusBarStyle::Dark));
        assert!(!has_status_bar_style_entry(&stacks, &first.info, -1));
        assert!(!has_status_bar_style_entry(&stacks, &second.info, handle));
    }

    #[test]
    fn keys_stacks_by_provider_identity_not_by_callbacks() {
        let host = fake_host(StatusBarStyle::Light);
        let mut stacks = create_status_bar_style_stacks();
        let handle = push(&mut stacks, &host, style_entry(StatusBarStyle::Dark));
        let same_callbacks_other_provider = HostStatusBarInfoCapability {
            provider: Arc::new(()),
            get_info: host.info.get_info.clone(),
        };
        let same_provider_other_record = HostStatusBarInfoCapability {
            provider: host.info.provider.clone(),
            get_info: Arc::new(|_out: &mut StatusBarInfo| {}),
        };
        assert!(!has_status_bar_style_entry(
            &stacks,
            &same_callbacks_other_provider,
            handle
        ));
        assert!(has_status_bar_style_entry(
            &stacks,
            &same_provider_other_record,
            handle
        ));
    }
}

mod initialize_status_bar {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_status_bar() {
        let mut out: StatusBar = flight_entity::allocate_entity();
        initialize_status_bar(&mut out);
        assert_eq!(format!("{:?}", out), format!("{:?}", create_status_bar()));
    }
}

mod initialize_status_bar_info {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_status_bar_info() {
        let mut out: StatusBarInfo = flight_entity::allocate_entity();
        out.height = 99.0;
        initialize_status_bar_info(&mut out);
        assert_eq!(out, create_status_bar_info());
    }
}

mod initialize_status_bar_style_stacks {
    use super::*;

    #[test]
    fn empties_every_stack_and_restarts_handles() {
        let host = fake_host(StatusBarStyle::Light);
        let mut stacks = create_status_bar_style_stacks();
        let handle = push(&mut stacks, &host, style_entry(StatusBarStyle::Dark));
        initialize_status_bar_style_stacks(&mut stacks);
        assert!(!has_status_bar_style_entry(&stacks, &host.info, handle));
        assert_eq!(
            push(&mut stacks, &host, style_entry(StatusBarStyle::Dark)),
            1
        );
    }
}

mod packed_rgba_to_hex_color {
    use super::*;

    #[test]
    fn drops_alpha_and_pads_hex_digits() {
        assert_eq!(packed_rgba_to_hex_color(0x01020304), "#010203");
    }

    #[test]
    fn treats_the_high_bit_as_unsigned() {
        assert_eq!(packed_rgba_to_hex_color(0xff8000c0), "#ff8000");
    }
}

mod parse_status_bar_animation {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings_and_rejects_others() {
        assert_eq!(
            parse_status_bar_animation("slide"),
            Some(StatusBarAnimation::Slide)
        );
        assert_eq!(
            parse_status_bar_animation("none"),
            Some(StatusBarAnimation::None)
        );
        assert_eq!(parse_status_bar_animation("Fade"), None);
        assert_eq!(parse_status_bar_animation(""), None);
    }
}

mod parse_status_bar_style {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings_and_rejects_others() {
        assert_eq!(
            parse_status_bar_style("default"),
            Some(StatusBarStyle::Default)
        );
        assert_eq!(parse_status_bar_style("light"), Some(StatusBarStyle::Light));
        assert_eq!(parse_status_bar_style("DARK"), None);
        assert_eq!(parse_status_bar_style(""), None);
    }
}

mod pop_status_bar_style_entry {
    use super::*;

    #[test]
    fn restores_the_captured_baseline() {
        let host = fake_host(StatusBarStyle::Light);
        let mut stacks = create_status_bar_style_stacks();
        let handle = push(&mut stacks, &host, style_entry(StatusBarStyle::Dark));
        pop_status_bar_style_entry(&mut stacks, &host.info, handle);
        assert_eq!(
            host.calls.lock().unwrap().style.last(),
            Some(&StatusBarStyle::Light)
        );
    }

    #[test]
    fn ignores_the_invalid_sentinel_and_unknown_handles() {
        let host = fake_host(StatusBarStyle::Light);
        let mut stacks = create_status_bar_style_stacks();
        let handle = push(&mut stacks, &host, style_entry(StatusBarStyle::Dark));
        pop_status_bar_style_entry(&mut stacks, &host.info, -1);
        pop_status_bar_style_entry(&mut stacks, &host.info, handle + 100);
        assert_eq!(host.calls.lock().unwrap().style, vec![StatusBarStyle::Dark]);
        assert!(has_status_bar_style_entry(&stacks, &host.info, handle));
    }

    #[test]
    fn popping_a_lower_entry_keeps_the_top_override() {
        let host = fake_host(StatusBarStyle::Light);
        let mut stacks = create_status_bar_style_stacks();
        let lower = push(&mut stacks, &host, style_entry(StatusBarStyle::Dark));
        push(&mut stacks, &host, style_entry(StatusBarStyle::Default));
        pop_status_bar_style_entry(&mut stacks, &host.info, lower);
        assert_eq!(
            host.calls.lock().unwrap().style,
            vec![StatusBarStyle::Dark, StatusBarStyle::Default]
        );
    }
}

mod push_status_bar_style_entry {
    use super::*;

    #[test]
    fn merges_unset_fields_through_the_stack() {
        let host = fake_host(StatusBarStyle::Light);
        let mut stacks = create_status_bar_style_stacks();
        push(&mut stacks, &host, style_entry(StatusBarStyle::Dark));
        push(
            &mut stacks,
            &host,
            StatusBarStyleEntry {
                animation: None,
                color: None,
                overlays_content: None,
                style: None,
                visible: Some(false),
            },
        );
        let calls = host.calls.lock().unwrap();
        assert_eq!(calls.style.len(), 1);
        assert_eq!(
            calls.visible.last(),
            Some(&(false, Some(StatusBarAnimation::None)))
        );
    }

    #[test]
    fn writes_only_changed_fields_in_source_order_with_the_merged_animation() {
        let host = fake_host(StatusBarStyle::Light);
        let mut stacks = create_status_bar_style_stacks();
        push(
            &mut stacks,
            &host,
            StatusBarStyleEntry {
                animation: Some(StatusBarAnimation::Fade),
                color: Some(0x112233ff),
                overlays_content: Some(true),
                style: None,
                visible: Some(false),
            },
        );
        let calls = host.calls.lock().unwrap();
        assert_eq!(calls.background_color, vec![(0x112233ff, Some(false))]);
        assert_eq!(calls.overlays_content, vec![true]);
        assert!(calls.style.is_empty());
        assert_eq!(calls.visible, vec![(false, Some(StatusBarAnimation::Fade))]);
    }

    #[test]
    fn returns_distinct_valid_handles() {
        let host = fake_host(StatusBarStyle::Light);
        let mut stacks = create_status_bar_style_stacks();
        let a = push(&mut stacks, &host, style_entry(StatusBarStyle::Dark));
        let b = push(&mut stacks, &host, style_entry(StatusBarStyle::Dark));
        assert!(a != -1 && b != -1 && a != b);
    }
}

mod set_status_bar_color {
    use super::*;

    #[test]
    fn uses_only_the_color_slot() {
        let host = fake_host(StatusBarStyle::Light);
        set_status_bar_color(&host.color, 0x112233ff, Some(true));
        assert_eq!(
            host.calls.lock().unwrap().background_color,
            vec![(0x112233ff, Some(true))]
        );
    }
}

mod set_status_bar_overlays_content {
    use super::*;

    #[test]
    fn uses_only_the_overlays_slot() {
        let host = fake_host(StatusBarStyle::Light);
        set_status_bar_overlays_content(&host.overlays, true);
        assert_eq!(host.calls.lock().unwrap().overlays_content, vec![true]);
    }
}

mod set_status_bar_style {
    use super::*;

    #[test]
    fn uses_only_the_style_slot() {
        let host = fake_host(StatusBarStyle::Light);
        set_status_bar_style(&host.style, StatusBarStyle::Dark);
        assert_eq!(host.calls.lock().unwrap().style, vec![StatusBarStyle::Dark]);
    }
}

mod set_status_bar_visible {
    use super::*;

    #[test]
    fn uses_only_the_visibility_slot() {
        let host = fake_host(StatusBarStyle::Light);
        set_status_bar_visible(&host.visibility, false, Some(StatusBarAnimation::Fade));
        assert_eq!(
            host.calls.lock().unwrap().visible,
            vec![(false, Some(StatusBarAnimation::Fade))]
        );
    }
}
