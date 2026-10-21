use std::sync::Arc;

use flight_entity::allocate_entity;
use flight_signals::{create_signal, emit_signal};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::Mutex;

    use flight_hostcapability::ProviderRef;

    use super::*;

    type Log = Arc<Mutex<Vec<String>>>;

    /// One provider's six facets, each logging what it receives.
    struct Facets {
        change: HostStatusBarChangeCapability,
        color: HostStatusBarColorCapability,
        info: HostStatusBarInfoCapability,
        overlays: HostStatusBarOverlaysCapability,
        style: HostStatusBarStyleCapability,
        visibility: HostStatusBarVisibilityCapability,
    }

    fn facets(log: Log) -> Facets {
        let provider: ProviderRef = Arc::new(());
        let (l1, l2, l3, l4, l5) = (
            log.clone(),
            log.clone(),
            log.clone(),
            log.clone(),
            log.clone(),
        );
        return Facets {
            change: HostStatusBarChangeCapability {
                provider: provider.clone(),
                subscribe: Arc::new(move |_listener: StatusBarChangeListener| {
                    let l = l1.clone();
                    let release: StatusBarUnsubscribe =
                        Arc::new(move || l.lock().unwrap().push("unsubscribe".to_string()));
                    return release;
                }),
            },
            color: HostStatusBarColorCapability {
                provider: provider.clone(),
                set_background_color: Arc::new(move |c: u32, a: Option<bool>| {
                    l2.lock().unwrap().push(format!("color {c:x} {a:?}"))
                }),
            },
            info: HostStatusBarInfoCapability {
                provider: provider.clone(),
                get_info: Arc::new(|out: &mut StatusBarInfo| {
                    out.height = 24.0;
                    out.style = StatusBarStyle::Light;
                }),
            },
            overlays: HostStatusBarOverlaysCapability {
                provider: provider.clone(),
                set_overlays_content: Arc::new(move |o: bool| {
                    l3.lock().unwrap().push(format!("overlays {o}"))
                }),
            },
            style: HostStatusBarStyleCapability {
                provider: provider.clone(),
                set_style: Arc::new(move |s: StatusBarStyle| {
                    l4.lock().unwrap().push(format!("style {s:?}"))
                }),
            },
            visibility: HostStatusBarVisibilityCapability {
                provider,
                set_visible: Arc::new(move |v: bool, a: Option<StatusBarAnimation>| {
                    l5.lock().unwrap().push(format!("visible {v} {a:?}"))
                }),
            },
        };
    }

    fn pair() -> (Log, Facets, Log, Facets) {
        let (la, lb): (Log, Log) = (
            Arc::new(Mutex::new(Vec::new())),
            Arc::new(Mutex::new(Vec::new())),
        );
        return (la.clone(), facets(la), lb.clone(), facets(lb));
    }

    fn dark() -> StatusBarStyleEntry {
        return StatusBarStyleEntry {
            animation: None,
            color: None,
            overlays_content: None,
            style: Some(StatusBarStyle::Dark),
            visible: None,
        };
    }

    #[test]
    fn host_status_bar_change_capability_attach_matches_attach_status_bar() {
        let (la, fa, lb, fb) = pair();
        let (mut a, mut b) = (create_status_bar(), create_status_bar());
        fa.change.attach(&fa.info, &mut a);
        attach_status_bar(&fb.change, &fb.info, &mut b);
        a.detach();
        detach_status_bar(&mut b);
        assert_eq!(*la.lock().unwrap(), *lb.lock().unwrap());
        assert_eq!(*la.lock().unwrap(), vec!["unsubscribe".to_string()]);
    }

    #[test]
    fn host_status_bar_color_capability_set_color_matches_set_status_bar_color() {
        let (la, fa, lb, fb) = pair();
        fa.color.set_color(0x112233ff, Some(true));
        set_status_bar_color(&fb.color, 0x112233ff, Some(true));
        assert_eq!(*la.lock().unwrap(), *lb.lock().unwrap());
        assert_eq!(
            *la.lock().unwrap(),
            vec!["color 112233ff Some(true)".to_string()]
        );
    }

    #[test]
    fn host_status_bar_info_capability_height_matches_get_status_bar_height() {
        let (_, fa, _, _) = pair();
        assert_eq!(fa.info.height(), get_status_bar_height(&fa.info));
        assert_eq!(fa.info.height(), 24.0);
    }

    #[test]
    fn host_status_bar_info_capability_info_matches_get_status_bar_info() {
        let (_, fa, _, _) = pair();
        let (mut a, mut b) = (create_status_bar_info(), create_status_bar_info());
        fa.info.info(&mut a);
        get_status_bar_info(&mut b, &fa.info);
        assert_eq!(a, b);
        assert_eq!(a.style, StatusBarStyle::Light);
    }

    #[test]
    fn host_status_bar_overlays_capability_set_status_bar_overlays_content_matches_free_function() {
        let (la, fa, lb, fb) = pair();
        fa.overlays.set_status_bar_overlays_content(true);
        set_status_bar_overlays_content(&fb.overlays, true);
        assert_eq!(*la.lock().unwrap(), *lb.lock().unwrap());
        assert_eq!(*la.lock().unwrap(), vec!["overlays true".to_string()]);
    }

    #[test]
    fn host_status_bar_style_capability_set_status_bar_style_matches_free_function() {
        let (la, fa, lb, fb) = pair();
        fa.style.set_status_bar_style(StatusBarStyle::Dark);
        set_status_bar_style(&fb.style, StatusBarStyle::Dark);
        assert_eq!(*la.lock().unwrap(), *lb.lock().unwrap());
        assert_eq!(*la.lock().unwrap(), vec!["style Dark".to_string()]);
    }

    #[test]
    fn host_status_bar_visibility_capability_set_status_bar_visible_matches_free_function() {
        let (la, fa, lb, fb) = pair();
        fa.visibility
            .set_status_bar_visible(false, Some(StatusBarAnimation::Slide));
        set_status_bar_visible(&fb.visibility, false, Some(StatusBarAnimation::Slide));
        assert_eq!(*la.lock().unwrap(), *lb.lock().unwrap());
        assert_eq!(
            *la.lock().unwrap(),
            vec!["visible false Some(Slide)".to_string()]
        );
    }

    #[test]
    fn status_bar_new_matches_create_status_bar() {
        assert_eq!(
            format!("{:?}", StatusBar::new()),
            format!("{:?}", create_status_bar())
        );
    }

    #[test]
    fn status_bar_detach_matches_detach_status_bar() {
        let (la, fa, lb, fb) = pair();
        let (mut a, mut b) = (create_status_bar(), create_status_bar());
        attach_status_bar(&fa.change, &fa.info, &mut a);
        attach_status_bar(&fb.change, &fb.info, &mut b);
        a.detach();
        detach_status_bar(&mut b);
        assert_eq!(*la.lock().unwrap(), *lb.lock().unwrap());
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn status_bar_dispose_matches_dispose_status_bar() {
        let (la, fa, lb, fb) = pair();
        let (mut a, mut b) = (create_status_bar(), create_status_bar());
        attach_status_bar(&fa.change, &fa.info, &mut a);
        attach_status_bar(&fb.change, &fb.info, &mut b);
        a.dispose();
        dispose_status_bar(&mut b);
        assert_eq!(*la.lock().unwrap(), *lb.lock().unwrap());
        assert_eq!(la.lock().unwrap().len(), 1);
    }

    #[test]
    fn status_bar_style_stacks_new_matches_create_status_bar_style_stacks() {
        assert_eq!(
            format!("{:?}", StatusBarStyleStacks::new()),
            format!("{:?}", create_status_bar_style_stacks())
        );
    }

    #[test]
    fn status_bar_style_stacks_push_and_has_style_entry_match_the_free_functions() {
        let (la, fa, lb, fb) = pair();
        let (mut a, mut b) = (
            create_status_bar_style_stacks(),
            create_status_bar_style_stacks(),
        );
        let ha = a.push_style_entry(
            &fa.color,
            &fa.info,
            &fa.overlays,
            &fa.style,
            &fa.visibility,
            &dark(),
        );
        let hb = push_status_bar_style_entry(
            &mut b,
            &fb.color,
            &fb.info,
            &fb.overlays,
            &fb.style,
            &fb.visibility,
            &dark(),
        );
        assert_eq!(ha, hb);
        assert_eq!(
            a.has_style_entry(&fa.info, ha),
            has_status_bar_style_entry(&b, &fb.info, hb)
        );
        assert!(a.has_style_entry(&fa.info, ha));
        assert_eq!(*la.lock().unwrap(), *lb.lock().unwrap());
    }

    #[test]
    fn status_bar_style_stacks_pop_style_entry_matches_pop_status_bar_style_entry() {
        let (la, fa, lb, fb) = pair();
        let (mut a, mut b) = (
            create_status_bar_style_stacks(),
            create_status_bar_style_stacks(),
        );
        let ha = push_status_bar_style_entry(
            &mut a,
            &fa.color,
            &fa.info,
            &fa.overlays,
            &fa.style,
            &fa.visibility,
            &dark(),
        );
        let hb = push_status_bar_style_entry(
            &mut b,
            &fb.color,
            &fb.info,
            &fb.overlays,
            &fb.style,
            &fb.visibility,
            &dark(),
        );
        a.pop_style_entry(&fa.info, ha);
        pop_status_bar_style_entry(&mut b, &fb.info, hb);
        assert_eq!(*la.lock().unwrap(), *lb.lock().unwrap());
        assert_eq!(la.lock().unwrap().last(), Some(&"style Light".to_string()));
    }

    #[test]
    fn status_bar_style_stacks_clear_style_stack_matches_clear_status_bar_style_stack() {
        let (la, fa, lb, fb) = pair();
        let (mut a, mut b) = (
            create_status_bar_style_stacks(),
            create_status_bar_style_stacks(),
        );
        push_status_bar_style_entry(
            &mut a,
            &fa.color,
            &fa.info,
            &fa.overlays,
            &fa.style,
            &fa.visibility,
            &dark(),
        );
        push_status_bar_style_entry(
            &mut b,
            &fb.color,
            &fb.info,
            &fb.overlays,
            &fb.style,
            &fb.visibility,
            &dark(),
        );
        a.clear_style_stack(&fa.info);
        clear_status_bar_style_stack(&mut b, &fb.info);
        assert_eq!(*la.lock().unwrap(), *lb.lock().unwrap());
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }
}

const INVALID_HANDLE: StatusBarStyleEntryHandle = -1;

pub fn create_status_bar() -> StatusBar {
    let mut out: StatusBar = allocate_entity();
    initialize_status_bar(&mut out);
    return out;
}

pub fn create_status_bar_info() -> StatusBarInfo {
    let mut out: StatusBarInfo = allocate_entity();
    initialize_status_bar_info(&mut out);
    return out;
}

// flight-lint: allow(conform-extra) D5: explicit caller-owned style-stack state replaces the source module WeakMap and handle counter
pub fn create_status_bar_style_stacks() -> StatusBarStyleStacks {
    let mut out = StatusBarStyleStacks {
        next_handle: 1,
        stacks: Vec::new(),
    };
    initialize_status_bar_style_stacks(&mut out);
    return out;
}

pub fn initialize_status_bar(out: &mut StatusBar) {
    out.on_change = create_signal();
    out.subscription = None;
}

/// The documented unknown/default snapshot: color 0, height -1, not overlaying, default style,
/// visible.
pub fn initialize_status_bar_info(out: &mut StatusBarInfo) {
    out.color = 0;
    out.height = -1.0;
    out.overlays_content = false;
    out.style = StatusBarStyle::Default;
    out.visible = true;
}

/// Empties every stack and restarts handles at 1 (-1 stays the invalid sentinel).
// flight-lint: allow(conform-extra) D5: explicit caller-owned style-stack state replaces the source module WeakMap and handle counter
pub fn initialize_status_bar_style_stacks(out: &mut StatusBarStyleStacks) {
    out.next_handle = 1;
    out.stacks.clear();
}

/// Merges the stack top-down (per field, the last pushed set value wins; absent fields fall through
/// to the baseline), writes only the fields that changed since the last application, in the source
/// order color, overlays, style, visibility (visibility with the merged animation, default `None`),
/// records them, and drops the stack once it is empty.
fn apply_top_style_entry(stacks: &mut StatusBarStyleStacks, index: usize) {
    let state = &mut stacks.stacks[index];
    let mut animation: Option<StatusBarAnimation> = None;
    let mut color: Option<u32> = None;
    let mut overlays_content: Option<bool> = None;
    let mut style: Option<StatusBarStyle> = None;
    let mut visible: Option<bool> = None;
    for (entry, _) in state.entries.iter().rev() {
        animation = animation.or(entry.animation);
        color = color.or(entry.color);
        overlays_content = overlays_content.or(entry.overlays_content);
        style = style.or(entry.style);
        visible = visible.or(entry.visible);
    }
    let color = color.unwrap_or(state.baseline.color);
    let overlays_content = overlays_content.unwrap_or(state.baseline.overlays_content);
    let style = style.unwrap_or(state.baseline.style);
    let visible = visible.unwrap_or(state.baseline.visible);

    if color != state.applied.color {
        (state.color_provider.set_background_color)(color, Some(false));
    }
    if overlays_content != state.applied.overlays_content {
        (state.overlays_provider.set_overlays_content)(overlays_content);
    }
    if style != state.applied.style {
        (state.style_provider.set_style)(style);
    }
    if visible != state.applied.visible {
        (state.visibility_provider.set_visible)(
            visible,
            Some(animation.unwrap_or(StatusBarAnimation::None)),
        );
    }
    state.applied.color = color;
    state.applied.overlays_content = overlays_content;
    state.applied.style = style;
    state.applied.visible = visible;
    if state.entries.is_empty() {
        stacks.stacks.remove(index);
    }
}

/// Starts delivering OS-driven changes to `bar.on_change`. Both providers are pinned at attachment:
/// each change reads a FRESH snapshot from the pinned info provider and emits it. A prior
/// subscription is released first. No lock is held while the signal emits.
pub fn attach_status_bar(
    host_status_bar_change: &HostStatusBarChangeCapability,
    host_status_bar_info: &HostStatusBarInfoCapability,
    bar: &mut StatusBar,
) {
    detach_status_bar(bar);
    let info_provider = host_status_bar_info.clone();
    let on_change = bar.on_change.clone();
    let listener: StatusBarChangeListener = Arc::new(move || {
        let mut info = create_status_bar_info();
        (info_provider.get_info)(&mut info);
        emit_signal(&on_change, &info);
    });
    bar.subscription = Some((host_status_bar_change.subscribe)(listener));
}

/// Clears the style stack of exactly this info provider and re-applies its captured baseline. A
/// no-op when the provider has no stack or an empty one.
// flight-lint: allow(conform-params) D5: explicit caller-owned StatusBarStyleStacks replaces the source module WeakMap; TS clearStatusBarStyleStack(hostStatusBarInfo)
pub fn clear_status_bar_style_stack(
    stacks: &mut StatusBarStyleStacks,
    host_status_bar_info: &HostStatusBarInfoCapability,
) {
    let Some(index) = find_style_stack(stacks, host_status_bar_info) else {
        return;
    };
    if stacks.stacks[index].entries.is_empty() {
        return;
    }
    stacks.stacks[index].entries.clear();
    apply_top_style_entry(stacks, index);
}

/// Releases the exact attached provider subscription once.
pub fn detach_status_bar(bar: &mut StatusBar) {
    let Some(unsubscribe) = bar.subscription.clone() else {
        return;
    };
    unsubscribe();
    bar.subscription = None;
}

pub fn dispose_status_bar(bar: &mut StatusBar) {
    detach_status_bar(bar);
}

/// The index of this info provider's stack, by provider object identity (`Arc::ptr_eq` on the
/// `provider` field, never on callbacks). A stack whose provider has been dropped never matches, as a
/// collected WeakMap key would not.
fn find_style_stack(
    stacks: &StatusBarStyleStacks,
    host_status_bar_info: &HostStatusBarInfoCapability,
) -> Option<usize> {
    return stacks
        .stacks
        .iter()
        .position(|stack| match stack.info.upgrade() {
            Some(provider) => Arc::ptr_eq(&provider, &host_status_bar_info.provider),
            None => false,
        });
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS StatusBarAnimation string union; the TS package exports no get_/parse_ free functions
pub fn get_status_bar_animation_string(value: StatusBarAnimation) -> &'static str {
    return match value {
        StatusBarAnimation::None => "none",
        StatusBarAnimation::Fade => "fade",
        StatusBarAnimation::Slide => "slide",
    };
}

/// The provider's height in CSS pixels, or -1 when not reported. Reads into a local snapshot (the
/// source's module scratch object is replaced by local state).
pub fn get_status_bar_height(host_status_bar_info: &HostStatusBarInfoCapability) -> f32 {
    let mut info = create_status_bar_info();
    (host_status_bar_info.get_info)(&mut info);
    return info.height;
}

/// Fills `out` with the provider's current snapshot.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn get_status_bar_info(
    out: &mut StatusBarInfo,
    host_status_bar_info: &HostStatusBarInfoCapability,
) {
    (host_status_bar_info.get_info)(out);
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS StatusBarStyle string union; the TS package exports no get_/parse_ free functions
pub fn get_status_bar_style_string(value: StatusBarStyle) -> &'static str {
    return match value {
        StatusBarStyle::Light => "light",
        StatusBarStyle::Dark => "dark",
        StatusBarStyle::Default => "default",
    };
}

/// Whether `handle` is on this info provider's stack. False for the invalid sentinel, for a provider
/// without a stack, and for a handle pushed onto another provider's stack.
// flight-lint: allow(conform-params) D5: explicit caller-owned StatusBarStyleStacks replaces the source module WeakMap; TS hasStatusBarStyleEntry(hostStatusBarInfo, handle)
pub fn has_status_bar_style_entry(
    stacks: &StatusBarStyleStacks,
    host_status_bar_info: &HostStatusBarInfoCapability,
    handle: StatusBarStyleEntryHandle,
) -> bool {
    if handle == INVALID_HANDLE {
        return false;
    }
    let Some(index) = find_style_stack(stacks, host_status_bar_info) else {
        return false;
    };
    return stacks.stacks[index]
        .entries
        .iter()
        .any(|(_, h)| *h == handle);
}

/// `#rrggbb` for a packed RGBA color, dropping alpha (an unsigned shift, as TS `>>>`).
pub fn packed_rgba_to_hex_color(color: u32) -> String {
    let rgb = (color >> 8) & 0xffffff;
    return format!("#{:06x}", rgb);
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS StatusBarAnimation string union; the TS package exports no get_/parse_ free functions
pub fn parse_status_bar_animation(value: &str) -> Option<StatusBarAnimation> {
    return match value {
        "none" => Some(StatusBarAnimation::None),
        "fade" => Some(StatusBarAnimation::Fade),
        "slide" => Some(StatusBarAnimation::Slide),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS StatusBarStyle string union; the TS package exports no get_/parse_ free functions
pub fn parse_status_bar_style(value: &str) -> Option<StatusBarStyle> {
    return match value {
        "light" => Some(StatusBarStyle::Light),
        "dark" => Some(StatusBarStyle::Dark),
        "default" => Some(StatusBarStyle::Default),
        _ => None,
    };
}

/// Removes `handle` from this info provider's stack and re-applies the new top (or the baseline). A
/// no-op for the invalid sentinel, a provider without a stack, or an unknown handle.
// flight-lint: allow(conform-params) D5: explicit caller-owned StatusBarStyleStacks replaces the source module WeakMap; TS popStatusBarStyleEntry(hostStatusBarInfo, handle)
pub fn pop_status_bar_style_entry(
    stacks: &mut StatusBarStyleStacks,
    host_status_bar_info: &HostStatusBarInfoCapability,
    handle: StatusBarStyleEntryHandle,
) {
    if handle == INVALID_HANDLE {
        return;
    }
    let Some(index) = find_style_stack(stacks, host_status_bar_info) else {
        return;
    };
    let Some(position) = stacks.stacks[index]
        .entries
        .iter()
        .position(|(_, h)| *h == handle)
    else {
        return;
    };
    stacks.stacks[index].entries.remove(position);
    apply_top_style_entry(stacks, index);
}

/// Pushes `entry` onto this info provider's stack and applies the merged top. The first push for a
/// provider captures its baseline snapshot once and pins the four command providers; later pushes
/// reuse them. Returns the new handle (never the invalid sentinel).
// flight-lint: allow(conform-params) D5: explicit caller-owned StatusBarStyleStacks replaces the source module WeakMap and handle counter; TS pushStatusBarStyleEntry(color, info, overlays, style, visibility, entry)
pub fn push_status_bar_style_entry(
    stacks: &mut StatusBarStyleStacks,
    host_status_bar_color: &HostStatusBarColorCapability,
    host_status_bar_info: &HostStatusBarInfoCapability,
    host_status_bar_overlays: &HostStatusBarOverlaysCapability,
    host_status_bar_style: &HostStatusBarStyleCapability,
    host_status_bar_visibility: &HostStatusBarVisibilityCapability,
    entry: &StatusBarStyleEntry,
) -> StatusBarStyleEntryHandle {
    let index = match find_style_stack(stacks, host_status_bar_info) {
        Some(index) => index,
        None => {
            let mut baseline = create_status_bar_info();
            (host_status_bar_info.get_info)(&mut baseline);
            stacks.stacks.push(StatusBarStyleStack {
                info: Arc::downgrade(&host_status_bar_info.provider),
                applied: baseline.clone(),
                baseline,
                color_provider: host_status_bar_color.clone(),
                entries: Vec::new(),
                overlays_provider: host_status_bar_overlays.clone(),
                style_provider: host_status_bar_style.clone(),
                visibility_provider: host_status_bar_visibility.clone(),
            });
            stacks.stacks.len() - 1
        }
    };
    let handle = stacks.next_handle;
    stacks.next_handle += 1;
    stacks.stacks[index].entries.push((entry.clone(), handle));
    apply_top_style_entry(stacks, index);
    return handle;
}

/// `animated` is optional, forwarded as given.
pub fn set_status_bar_color(
    host_status_bar_color: &HostStatusBarColorCapability,
    color: u32,
    animated: Option<bool>,
) {
    (host_status_bar_color.set_background_color)(color, animated);
}

pub fn set_status_bar_overlays_content(
    host_status_bar_overlays: &HostStatusBarOverlaysCapability,
    overlay: bool,
) {
    (host_status_bar_overlays.set_overlays_content)(overlay);
}

pub fn set_status_bar_style(
    host_status_bar_style: &HostStatusBarStyleCapability,
    style: StatusBarStyle,
) {
    (host_status_bar_style.set_style)(style);
}

/// `animation` is optional, forwarded as given.
pub fn set_status_bar_visible(
    host_status_bar_visibility: &HostStatusBarVisibilityCapability,
    visible: bool,
    animation: Option<StatusBarAnimation>,
) {
    (host_status_bar_visibility.set_visible)(visible, animation);
}

impl HostStatusBarChangeCapability {
    pub fn attach(&self, host_status_bar_info: &HostStatusBarInfoCapability, bar: &mut StatusBar) {
        attach_status_bar(self, host_status_bar_info, bar);
    }
}

impl HostStatusBarColorCapability {
    pub fn set_color(&self, color: u32, animated: Option<bool>) {
        set_status_bar_color(self, color, animated);
    }
}

impl HostStatusBarInfoCapability {
    pub fn height(&self) -> f32 {
        return get_status_bar_height(self);
    }

    pub fn info(&self, out: &mut StatusBarInfo) {
        get_status_bar_info(out, self);
    }
}

// These three capabilities already have fields with the short names (`set_overlays_content`,
// `set_style`, `set_visible`), so their delegates keep the fuller free-function names (D18 collision
// rule) rather than shadow the raw provider callbacks.
impl HostStatusBarOverlaysCapability {
    pub fn set_status_bar_overlays_content(&self, overlay: bool) {
        set_status_bar_overlays_content(self, overlay);
    }
}

impl HostStatusBarStyleCapability {
    pub fn set_status_bar_style(&self, style: StatusBarStyle) {
        set_status_bar_style(self, style);
    }
}

impl HostStatusBarVisibilityCapability {
    pub fn set_status_bar_visible(&self, visible: bool, animation: Option<StatusBarAnimation>) {
        set_status_bar_visible(self, visible, animation);
    }
}

impl StatusBar {
    pub fn new() -> Self {
        return create_status_bar();
    }

    pub fn detach(&mut self) {
        detach_status_bar(self);
    }

    pub fn dispose(&mut self) {
        dispose_status_bar(self);
    }
}

impl StatusBarStyleStacks {
    pub fn new() -> Self {
        return create_status_bar_style_stacks();
    }

    pub fn clear_style_stack(&mut self, host_status_bar_info: &HostStatusBarInfoCapability) {
        clear_status_bar_style_stack(self, host_status_bar_info);
    }

    pub fn has_style_entry(
        &self,
        host_status_bar_info: &HostStatusBarInfoCapability,
        handle: StatusBarStyleEntryHandle,
    ) -> bool {
        return has_status_bar_style_entry(self, host_status_bar_info, handle);
    }

    pub fn pop_style_entry(
        &mut self,
        host_status_bar_info: &HostStatusBarInfoCapability,
        handle: StatusBarStyleEntryHandle,
    ) {
        pop_status_bar_style_entry(self, host_status_bar_info, handle);
    }

    pub fn push_style_entry(
        &mut self,
        host_status_bar_color: &HostStatusBarColorCapability,
        host_status_bar_info: &HostStatusBarInfoCapability,
        host_status_bar_overlays: &HostStatusBarOverlaysCapability,
        host_status_bar_style: &HostStatusBarStyleCapability,
        host_status_bar_visibility: &HostStatusBarVisibilityCapability,
        entry: &StatusBarStyleEntry,
    ) -> StatusBarStyleEntryHandle {
        return push_status_bar_style_entry(
            self,
            host_status_bar_color,
            host_status_bar_info,
            host_status_bar_overlays,
            host_status_bar_style,
            host_status_bar_visibility,
            entry,
        );
    }
}
