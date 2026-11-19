use std::ffi::CString;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use flight_host_sdl::*;
use flight_input::{
    GamepadButtonKind, GamepadMapping, InputGamepadButtonData, InputIngressSink, InputPointerData,
    InputTextData, get_gamepad_button_name,
};

#[derive(Default)]
struct RecordedInput {
    gamepad_buttons: Vec<(bool, InputGamepadButtonData)>,
    pointer_moves: Vec<InputPointerData>,
    text_edits: Vec<InputTextData>,
    text_inputs: Vec<InputTextData>,
}

fn display_available() -> bool {
    return std::env::var_os("DISPLAY").is_some() || std::env::var_os("WAYLAND_DISPLAY").is_some();
}

fn pump_for(host: &mut SdlHost, duration: Duration) {
    let deadline = Instant::now() + duration;
    while Instant::now() < deadline {
        assert_eq!(
            pump_sdl_host(host).expect("pump SDL input host"),
            SdlPumpStatus::Continue
        );
        std::thread::sleep(Duration::from_millis(5));
    }
}

fn recording_sink(recorded: &Arc<Mutex<RecordedInput>>) -> InputIngressSink {
    let gamepad_down = recorded.clone();
    let gamepad_up = recorded.clone();
    let pointer_move = recorded.clone();
    let text_edit = recorded.clone();
    let text_input = recorded.clone();
    return InputIngressSink {
        gamepad_axis_move: Arc::new(|_| {}),
        gamepad_button_down: Arc::new(move |data| {
            gamepad_down
                .lock()
                .unwrap()
                .gamepad_buttons
                .push((true, *data));
        }),
        gamepad_button_up: Arc::new(move |data| {
            gamepad_up
                .lock()
                .unwrap()
                .gamepad_buttons
                .push((false, *data));
        }),
        gamepad_connect: Arc::new(|_| {}),
        gamepad_disconnect: Arc::new(|_| {}),
        is_enabled: Arc::new(|| true),
        key_down: Arc::new(|_| {}),
        key_up: Arc::new(|_| {}),
        pointer_cancel: Arc::new(|_| {}),
        pointer_down: Arc::new(|_| {}),
        pointer_move: Arc::new(move |data| {
            pointer_move
                .lock()
                .unwrap()
                .pointer_moves
                .push(data.clone());
        }),
        pointer_move_relative: Arc::new(|_| {}),
        pointer_up: Arc::new(|_| {}),
        text_edit: Arc::new(move |data| {
            text_edit.lock().unwrap().text_edits.push(data.clone());
        }),
        text_input: Arc::new(move |data| {
            text_input.lock().unwrap().text_inputs.push(data.clone());
        }),
        wheel: Arc::new(|_| {}),
    };
}

fn run_xdotool(arguments: &[&str]) -> String {
    let output = Command::new("xdotool")
        .args(arguments)
        .output()
        .unwrap_or_else(|error| panic!("run xdotool {arguments:?}: {error}"));
    assert!(output.status.success(), "xdotool {arguments:?}");
    return String::from_utf8(output.stdout).expect("xdotool UTF-8 output");
}

fn push_text_editing(window_id: u32, text: &CString) {
    use sdl3::sys::events::{SDL_EVENT_TEXT_EDITING, SDL_Event, SDL_TextEditingEvent};
    let mut event = SDL_Event {
        edit: SDL_TextEditingEvent {
            r#type: SDL_EVENT_TEXT_EDITING,
            windowID: sdl3::sys::video::SDL_WindowID(window_id),
            text: text.as_ptr(),
            start: 0,
            length: text.as_bytes().len() as i32,
            ..Default::default()
        },
    };
    // SAFETY: SDL copies this event while `text` remains live through the following pump.
    assert!(unsafe { sdl3::sys::events::SDL_PushEvent(&mut event) });
}

fn push_text_input(window_id: u32, text: &CString) {
    use sdl3::sys::events::{SDL_EVENT_TEXT_INPUT, SDL_Event, SDL_TextInputEvent};
    let mut event = SDL_Event {
        text: SDL_TextInputEvent {
            r#type: SDL_EVENT_TEXT_INPUT,
            windowID: sdl3::sys::video::SDL_WindowID(window_id),
            text: text.as_ptr(),
            ..Default::default()
        },
    };
    // SAFETY: SDL copies this event while `text` remains live through the following pump.
    assert!(unsafe { sdl3::sys::events::SDL_PushEvent(&mut event) });
}

fn test_focused_text_and_pointer(host: &mut SdlHost, recorded: &Arc<Mutex<RecordedInput>>) {
    let ingress = get_sdl_host_input_ingress_capability(host).clone();
    let source = get_sdl_host_input_source(host).clone();
    let first_text_release = (ingress.attach_text)(&source, recording_sink(recorded), None);
    pump_for(host, Duration::from_millis(50));

    let window = run_xdotool(&["search", "--name", "Flight SDL input oracle"]);
    let window = window.lines().next().expect("host X11 window");
    run_xdotool(&["windowfocus", window]);
    pump_for(host, Duration::from_millis(50));

    let focused = unsafe { sdl3::sys::keyboard::SDL_GetKeyboardFocus() };
    assert!(!focused.is_null(), "SDL focused window");
    assert!(unsafe { sdl3::sys::keyboard::SDL_TextInputActive(focused) });
    let window_id = unsafe { sdl3::sys::video::SDL_GetWindowID(focused) }.0;
    assert_ne!(window_id, 0);

    let second_text_release = (ingress.attach_text)(&source, recording_sink(recorded), None);
    let pointer_release = (ingress.attach_pointer)(&source, recording_sink(recorded), None);
    pump_for(host, Duration::from_millis(25));
    run_xdotool(&["type", "--delay", "20", "ab"]);
    pump_for(host, Duration::from_millis(100));

    let composition = CString::new("composition").unwrap();
    let foreign = CString::new("foreign-window").unwrap();
    push_text_editing(window_id, &composition);
    push_text_input(window_id.wrapping_add(10_000), &foreign);
    pump_for(host, Duration::from_millis(50));

    run_xdotool(&["mousemove", "--window", window, "40", "50"]);
    run_xdotool(&["mousedown", "1"]);
    run_xdotool(&["mousemove", "--window", window, "50", "60"]);
    pump_for(host, Duration::from_millis(30));
    run_xdotool(&["mousedown", "3"]);
    run_xdotool(&["mousemove", "--window", window, "60", "70"]);
    pump_for(host, Duration::from_millis(30));
    run_xdotool(&["mouseup", "1"]);
    run_xdotool(&["mousemove", "--window", window, "70", "80"]);
    pump_for(host, Duration::from_millis(30));
    run_xdotool(&["mouseup", "3"]);
    run_xdotool(&["mousemove", "--window", window, "80", "90"]);
    pump_for(host, Duration::from_millis(50));

    let recorded = recorded.lock().unwrap();
    let committed: String = recorded
        .text_inputs
        .iter()
        .map(|data| data.text.as_str())
        .collect();
    assert!(
        committed.contains("ab"),
        "focused committed text: {committed:?}"
    );
    assert!(!committed.contains("foreign-window"));
    assert!(
        recorded
            .text_edits
            .iter()
            .any(|data| data.is_composing && data.text == "composition")
    );
    let masks: Vec<u32> = recorded
        .pointer_moves
        .iter()
        .map(|data| data.buttons)
        .collect();
    assert!(masks.contains(&1), "left-button mask persisted: {masks:?}");
    assert!(masks.contains(&3), "two-button mask persisted: {masks:?}");
    assert!(masks.contains(&2), "right-button mask persisted: {masks:?}");
    assert_eq!(masks.last(), Some(&0), "released mask persisted: {masks:?}");
    drop(recorded);

    first_text_release();
    pump_for(host, Duration::from_millis(25));
    assert!(unsafe { sdl3::sys::keyboard::SDL_TextInputActive(focused) });
    second_text_release();
    pump_for(host, Duration::from_millis(25));
    assert!(!unsafe { sdl3::sys::keyboard::SDL_TextInputActive(focused) });
    second_text_release();
    pointer_release();
}

fn test_virtual_gamepad(host: &mut SdlHost, recorded: &Arc<Mutex<RecordedInput>>) {
    let ingress = get_sdl_host_input_ingress_capability(host).clone();
    let source = get_sdl_host_input_source(host).clone();
    let gamepad_release = (ingress.attach_gamepad)(&source, recording_sink(recorded), None);

    unsafe {
        use sdl3::sys::gamepad::*;
        use sdl3::sys::joystick::*;

        let mut descriptor = SDL_VirtualJoystickDesc::new();
        descriptor.r#type = SDL_JOYSTICK_TYPE_GAMEPAD.0 as u16;
        descriptor.naxes = SDL_GAMEPAD_AXIS_COUNT.0 as u16;
        descriptor.nbuttons = SDL_GAMEPAD_BUTTON_COUNT.0 as u16;
        descriptor.name = c"Flight SDL virtual pad".as_ptr();
        let id = SDL_AttachVirtualJoystick(&descriptor);
        assert_ne!(id.0, 0, "attach virtual joystick");
        pump_for(host, Duration::from_millis(100));
        let joystick = SDL_OpenJoystick(id);
        assert!(!joystick.is_null(), "open virtual joystick");
        recorded.lock().unwrap().gamepad_buttons.clear();

        let buttons = [
            (SDL_GAMEPAD_BUTTON_SOUTH.0, GamepadButtonKind::ButtonSouth),
            (SDL_GAMEPAD_BUTTON_EAST.0, GamepadButtonKind::ButtonEast),
            (SDL_GAMEPAD_BUTTON_WEST.0, GamepadButtonKind::ButtonWest),
            (SDL_GAMEPAD_BUTTON_NORTH.0, GamepadButtonKind::ButtonNorth),
            (SDL_GAMEPAD_BUTTON_BACK.0, GamepadButtonKind::Select),
            (SDL_GAMEPAD_BUTTON_GUIDE.0, GamepadButtonKind::Home),
            (SDL_GAMEPAD_BUTTON_START.0, GamepadButtonKind::Start),
            (
                SDL_GAMEPAD_BUTTON_LEFT_STICK.0,
                GamepadButtonKind::StickLeft,
            ),
            (
                SDL_GAMEPAD_BUTTON_RIGHT_STICK.0,
                GamepadButtonKind::StickRight,
            ),
            (
                SDL_GAMEPAD_BUTTON_LEFT_SHOULDER.0,
                GamepadButtonKind::ShoulderLeft,
            ),
            (
                SDL_GAMEPAD_BUTTON_RIGHT_SHOULDER.0,
                GamepadButtonKind::ShoulderRight,
            ),
            (SDL_GAMEPAD_BUTTON_DPAD_UP.0, GamepadButtonKind::DpadUp),
            (SDL_GAMEPAD_BUTTON_DPAD_DOWN.0, GamepadButtonKind::DpadDown),
            (SDL_GAMEPAD_BUTTON_DPAD_LEFT.0, GamepadButtonKind::DpadLeft),
            (
                SDL_GAMEPAD_BUTTON_DPAD_RIGHT.0,
                GamepadButtonKind::DpadRight,
            ),
            (SDL_GAMEPAD_BUTTON_TOUCHPAD.0, GamepadButtonKind::Touchpad),
        ];
        for (button, _) in buttons {
            assert!(SDL_SetJoystickVirtualButton(joystick, button, true));
            pump_for(host, Duration::from_millis(20));
            assert!(SDL_SetJoystickVirtualButton(joystick, button, false));
            pump_for(host, Duration::from_millis(20));
        }

        let events = recorded.lock().unwrap().gamepad_buttons.clone();
        let down: Vec<_> = events
            .iter()
            .filter(|(pressed, _)| *pressed)
            .map(|(_, data)| data)
            .collect();
        assert_eq!(
            down.len(),
            buttons.len(),
            "virtual button downs: {events:?}"
        );
        for (data, (_, expected)) in down.iter().zip(buttons) {
            assert_eq!(
                get_gamepad_button_name(GamepadMapping::Standard, data.button),
                Some(expected),
                "virtual button index {}",
                data.button
            );
        }

        recorded.lock().unwrap().gamepad_buttons.clear();
        assert!(SDL_SetJoystickVirtualAxis(
            joystick,
            SDL_GAMEPAD_AXIS_LEFT_TRIGGER.0,
            8_000
        ));
        pump_for(host, Duration::from_millis(20));
        assert!(SDL_SetJoystickVirtualAxis(
            joystick,
            SDL_GAMEPAD_AXIS_LEFT_TRIGGER.0,
            20_000
        ));
        pump_for(host, Duration::from_millis(20));
        assert!(SDL_SetJoystickVirtualAxis(
            joystick,
            SDL_GAMEPAD_AXIS_LEFT_TRIGGER.0,
            30_000
        ));
        pump_for(host, Duration::from_millis(20));
        assert!(SDL_SetJoystickVirtualAxis(
            joystick,
            SDL_GAMEPAD_AXIS_LEFT_TRIGGER.0,
            10_000
        ));
        pump_for(host, Duration::from_millis(20));
        assert!(SDL_SetJoystickVirtualAxis(
            joystick,
            SDL_GAMEPAD_AXIS_LEFT_TRIGGER.0,
            0
        ));
        pump_for(host, Duration::from_millis(20));

        let trigger_events = recorded.lock().unwrap().gamepad_buttons.clone();
        assert_eq!(
            trigger_events.len(),
            2,
            "trigger threshold edges: {trigger_events:?}"
        );
        assert!(trigger_events[0].0);
        assert!(!trigger_events[1].0);
        for (_, data) in &trigger_events {
            assert_eq!(
                get_gamepad_button_name(GamepadMapping::Standard, data.button),
                Some(GamepadButtonKind::TriggerLeft)
            );
        }
        assert!(
            (0.5..=1.0).contains(&trigger_events[0].1.value),
            "down retains normalized analog value: {trigger_events:?}"
        );
        assert!(
            (0.0..0.5).contains(&trigger_events[1].1.value),
            "up retains normalized analog value: {trigger_events:?}"
        );

        SDL_CloseJoystick(joystick);
        assert!(SDL_DetachVirtualJoystick(id));
        pump_for(host, Duration::from_millis(50));
    }
    gamepad_release();
}

fn main() {
    if !display_available() {
        eprintln!("SKIP I3 SDL input: no DISPLAY or WAYLAND_DISPLAY");
        return;
    }
    let mut host = create_sdl_host(&create_sdl_host_options(
        "Flight SDL input oracle",
        320.0,
        240.0,
        true,
        SdlHostRenderBackend::Wgpu,
    ))
    .unwrap_or_else(|failure| panic!("{failure}"));
    let recorded = Arc::new(Mutex::new(RecordedInput::default()));
    test_focused_text_and_pointer(&mut host, &recorded);
    test_virtual_gamepad(&mut host, &recorded);
    destroy_sdl_host(host).expect("destroy SDL input host");
}
