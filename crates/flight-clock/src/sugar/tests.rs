use std::sync::Arc;

use super::*;

// flight-lint: allow(f64) mirrors the Clock contract's f64 millisecond scale and time
fn clock(scale: f64, paused: bool) -> Ref<Clock> {
    let out = create_clock();
    out.write().unwrap().scale = scale;
    out.write().unwrap().paused = paused;
    return out;
}

#[test]
fn clock_add_child_matches_add_clock_child() {
    let (a, b) = pair(1.0, false);
    let (ca, cb) = pair(1.0, false);
    a.add_child(&ca);
    add_clock_child(&b, &cb);
    assert!(same_state(&a, &b) && same_state(&ca, &cb));
    assert!(Arc::ptr_eq(ca.read().unwrap().parent.as_ref().unwrap(), &a));
}

#[test]
fn clock_advance_matches_advance_clock() {
    let (a, b) = pair(2.0, false);
    let ca = a.create_child(Some(&ClockOptions {
        scale: Some(0.5),
        paused: None,
    }));
    let cb = create_child_clock(
        &b,
        Some(&ClockOptions {
            scale: Some(0.5),
            paused: None,
        }),
    );
    a.advance(300.0);
    advance_clock(&b, 300.0);
    assert!(same_state(&a, &b) && same_state(&ca, &cb));
    assert_eq!(ca.read().unwrap().delta_time, 300.0);
}

#[test]
fn clock_create_child_matches_create_child_clock() {
    let (a, b) = pair(1.0, false);
    let options = ClockOptions {
        scale: Some(3.0),
        paused: Some(true),
    };
    let ca = a.create_child(Some(&options));
    let cb = create_child_clock(&b, Some(&options));
    assert!(same_state(&a, &b) && same_state(&ca, &cb));
}

#[test]
fn clock_dispose_matches_dispose_clock() {
    let (a, b) = pair(1.0, false);
    let ca = a.create_child(None);
    let cb = b.create_child(None);
    a.dispose();
    dispose_clock(&b);
    assert!(same_state(&a, &b) && same_state(&ca, &cb));
    assert!(ca.read().unwrap().parent.is_none());
}

#[test]
fn clock_effective_scale_matches_get_clock_effective_scale() {
    let parent = clock(2.0, false);
    let child = create_child_clock(
        &parent,
        Some(&ClockOptions {
            scale: Some(1.5),
            paused: None,
        }),
    );
    let child = child.read().unwrap();
    assert_eq!(child.effective_scale(), get_clock_effective_scale(&child));
    assert_eq!(child.effective_scale(), 3.0);
}

#[test]
fn clock_enable_signals_matches_enable_clock_signals() {
    let a = create_clock();
    let b = create_clock();
    let sa = a.write().unwrap().enable_signals();
    let sb = enable_clock_signals(&mut b.write().unwrap());
    assert!(Arc::ptr_eq(
        &sa.data,
        &a.read().unwrap().on_tick.as_ref().unwrap().data
    ));
    assert!(Arc::ptr_eq(
        &sb.data,
        &b.read().unwrap().on_tick.as_ref().unwrap().data
    ));
    assert!(Arc::ptr_eq(
        &a.write().unwrap().enable_signals().data,
        &sa.data
    ));
}

#[test]
fn clock_is_effectively_paused_matches_is_clock_effectively_paused() {
    let parent = clock(1.0, true);
    let child = create_child_clock(&parent, None);
    let child = child.read().unwrap();
    assert_eq!(
        child.is_effectively_paused(),
        is_clock_effectively_paused(&child)
    );
    assert!(child.is_effectively_paused());
}

#[test]
fn clock_new_matches_create_clock() {
    assert!(same_state(&Clock::new(), &create_clock()));
}

#[test]
fn clock_parent_matches_get_clock_parent() {
    let parent = create_clock();
    let child = create_child_clock(&parent, None);
    let child = child.read().unwrap();
    assert!(Arc::ptr_eq(
        &child.parent().unwrap(),
        &get_clock_parent(&child).unwrap()
    ));
}

#[test]
fn clock_pause_matches_pause_clock() {
    let (a, b) = pair(1.0, false);
    a.write().unwrap().pause();
    pause_clock(&mut b.write().unwrap());
    assert!(same_state(&a, &b) && a.read().unwrap().paused);
}

#[test]
fn clock_remove_child_matches_remove_clock_child() {
    let (a, b) = pair(1.0, false);
    let ca = a.create_child(None);
    let cb = b.create_child(None);
    a.remove_child(&ca);
    remove_clock_child(&b, &cb);
    assert!(same_state(&a, &b) && same_state(&ca, &cb));
    assert!(a.read().unwrap().children.is_empty());
}

#[test]
fn clock_reset_matches_reset_clock() {
    let (a, b) = pair(2.0, false);
    advance_clock(&a, 10.0);
    advance_clock(&b, 10.0);
    a.write().unwrap().reset();
    reset_clock(&mut b.write().unwrap());
    assert!(same_state(&a, &b) && a.read().unwrap().elapsed == 0.0);
}

#[test]
fn clock_resume_matches_resume_clock() {
    let (a, b) = pair(1.0, true);
    a.write().unwrap().resume();
    resume_clock(&mut b.write().unwrap());
    assert!(same_state(&a, &b) && !a.read().unwrap().paused);
}

#[test]
fn clock_set_scale_matches_set_clock_scale() {
    let (a, b) = pair(1.0, false);
    a.write().unwrap().set_scale(0.25);
    set_clock_scale(&mut b.write().unwrap(), 0.25);
    assert!(same_state(&a, &b) && a.read().unwrap().scale == 0.25);
}

// flight-lint: allow(f64) mirrors the Clock contract's f64 millisecond scale and time
fn pair(scale: f64, paused: bool) -> (Ref<Clock>, Ref<Clock>) {
    return (clock(scale, paused), clock(scale, paused));
}

fn same_state(a: &Ref<Clock>, b: &Ref<Clock>) -> bool {
    return format!("{:?}", a.read().unwrap()) == format!("{:?}", b.read().unwrap());
}
