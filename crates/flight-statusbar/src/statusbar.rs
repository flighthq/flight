use std::sync::Arc;

use flight_entity::allocate_entity;
use flight_signals::{create_signal, emit_signal};

use crate::types::*;

const INVALID_HANDLE: StatusBarStyleEntryHandle = -1;

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

/// The provider's height in CSS pixels, or -1 when not reported. Reads into a local snapshot (the
/// source's module scratch object is replaced by local state).
pub fn get_status_bar_height(host_status_bar_info: &HostStatusBarInfoCapability) -> f32 {
    let mut info = create_status_bar_info();
    (host_status_bar_info.get_info)(&mut info);
    return info.height;
}

/// Fills `out` with the provider's current snapshot.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn get_status_bar_info(out: &mut StatusBarInfo, host_status_bar_info: &HostStatusBarInfoCapability) {
    (host_status_bar_info.get_info)(out);
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
    return stacks.stacks[index].entries.iter().any(|(_, h)| *h == handle);
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

/// `#rrggbb` for a packed RGBA color, dropping alpha (an unsigned shift, as TS `>>>`).
pub fn packed_rgba_to_hex_color(color: u32) -> String {
    let rgb = (color >> 8) & 0xffffff;
    return format!("#{:06x}", rgb);
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
    let Some(position) = stacks.stacks[index].entries.iter().position(|(_, h)| *h == handle) else {
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
pub fn set_status_bar_color(host_status_bar_color: &HostStatusBarColorCapability, color: u32, animated: Option<bool>) {
    (host_status_bar_color.set_background_color)(color, animated);
}

pub fn set_status_bar_overlays_content(host_status_bar_overlays: &HostStatusBarOverlaysCapability, overlay: bool) {
    (host_status_bar_overlays.set_overlays_content)(overlay);
}

pub fn set_status_bar_style(host_status_bar_style: &HostStatusBarStyleCapability, style: StatusBarStyle) {
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

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS StatusBarAnimation string union; the TS package exports no get_/parse_ free functions
pub fn get_status_bar_animation_string(value: StatusBarAnimation) -> &'static str {
    return match value {
        StatusBarAnimation::None => "none",
        StatusBarAnimation::Fade => "fade",
        StatusBarAnimation::Slide => "slide",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS StatusBarStyle string union; the TS package exports no get_/parse_ free functions
pub fn get_status_bar_style_string(value: StatusBarStyle) -> &'static str {
    return match value {
        StatusBarStyle::Light => "light",
        StatusBarStyle::Dark => "dark",
        StatusBarStyle::Default => "default",
    };
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
        (state.visibility_provider.set_visible)(visible, Some(animation.unwrap_or(StatusBarAnimation::None)));
    }
    state.applied.color = color;
    state.applied.overlays_content = overlays_content;
    state.applied.style = style;
    state.applied.visible = visible;
    if state.entries.is_empty() {
        stacks.stacks.remove(index);
    }
}

/// The index of this info provider's stack, by provider object identity (`Arc::ptr_eq` on the
/// `provider` field, never on callbacks). A stack whose provider has been dropped never matches, as a
/// collected WeakMap key would not.
fn find_style_stack(stacks: &StatusBarStyleStacks, host_status_bar_info: &HostStatusBarInfoCapability) -> Option<usize> {
    return stacks.stacks.iter().position(|stack| match stack.info.upgrade() {
        Some(provider) => Arc::ptr_eq(&provider, &host_status_bar_info.provider),
        None => false,
    });
}
