use std::sync::{Arc, Mutex};

use flight_clipboard::contract::*;
use flight_entity::{
    FlightError, FlightErrorKind, Record, entries, get_record_keys, get_record_value,
    set_record_value,
};

use crate::block_on;

struct State {
    bookmark: Option<ClipboardBookmark>,
    custom: Vec<(String, String)>,
    denied: bool,
    html: String,
    image: String,
    listeners: Vec<Option<ClipboardUnsubscribe>>,
    rejected: bool,
    rtf: String,
    text: String,
}

struct FakeBackend {
    bookmark: HostClipboardBookmarkCapability,
    change: HostClipboardChangeSubscriber,
    formats: HostClipboardFormatsCapability,
    image: HostClipboardImageCapability,
    state: Arc<Mutex<State>>,
    text: HostClipboardTextCapability,
}

fn dedupe(values: Vec<String>) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    for value in values {
        if !result.contains(&value) {
            result.push(value);
        }
    }
    return result;
}

fn emit_listeners(state: &Arc<Mutex<State>>) {
    let callbacks: Vec<ClipboardUnsubscribe> = state
        .lock()
        .unwrap()
        .listeners
        .iter()
        .flatten()
        .cloned()
        .collect();
    for callback in callbacks {
        callback();
    }
}

fn empty_record() -> Record<String> {
    let make: fn() -> Record<String> = Record::default;
    return make();
}

fn fake_backend(denied: bool) -> FakeBackend {
    return build_backend(denied, false);
}

fn formats_of(state: &State) -> Vec<String> {
    let mut formats: Vec<String> = state
        .custom
        .iter()
        .map(|(format, _)| format.clone())
        .collect();
    if !state.text.is_empty() {
        formats.push(CLIPBOARD_FORMAT_TEXT.to_string());
    }
    if !state.html.is_empty() {
        formats.push(CLIPBOARD_FORMAT_HTML.to_string());
    }
    if !state.image.is_empty() {
        formats.push(CLIPBOARD_FORMAT_IMAGE.to_string());
    }
    if !state.rtf.is_empty() {
        formats.push(CLIPBOARD_FORMAT_RTF.to_string());
    }
    if state.bookmark.is_some() {
        formats.push(CLIPBOARD_FORMAT_BOOKMARK.to_string());
    }
    return dedupe(formats);
}

fn listener_count(state: &Arc<Mutex<State>>) -> usize {
    return state.lock().unwrap().listeners.iter().flatten().count();
}

fn read_format_of(state: &State, format: &str) -> String {
    return match format {
        CLIPBOARD_FORMAT_TEXT => state.text.clone(),
        CLIPBOARD_FORMAT_HTML => state.html.clone(),
        CLIPBOARD_FORMAT_IMAGE => state.image.clone(),
        CLIPBOARD_FORMAT_RTF => state.rtf.clone(),
        _ => state
            .custom
            .iter()
            .find(|(candidate, _)| candidate == format)
            .map(|(_, data)| data.clone())
            .unwrap_or_default(),
    };
}

fn rejected_error() -> FlightError {
    return FlightError {
        kind: FlightErrorKind::Error,
        message: "clipboard rejected".to_string(),
    };
}

fn rejecting_backend() -> FakeBackend {
    return build_backend(false, true);
}

fn write_format_into(state: &mut State, format: &str, data: &str) {
    match format {
        CLIPBOARD_FORMAT_TEXT => state.text = data.to_string(),
        CLIPBOARD_FORMAT_HTML => state.html = data.to_string(),
        CLIPBOARD_FORMAT_IMAGE => state.image = data.to_string(),
        CLIPBOARD_FORMAT_RTF => state.rtf = data.to_string(),
        _ => match state
            .custom
            .iter_mut()
            .find(|(candidate, _)| candidate == format)
        {
            Some((_, value)) => *value = data.to_string(),
            None => state.custom.push((format.to_string(), data.to_string())),
        },
    }
}

fn build_backend(denied: bool, rejected: bool) -> FakeBackend {
    let state = Arc::new(Mutex::new(State {
        bookmark: None,
        custom: Vec::new(),
        denied,
        html: String::new(),
        image: String::new(),
        listeners: Vec::new(),
        rejected,
        rtf: String::new(),
        text: String::new(),
    }));

    let bookmark = HostClipboardBookmarkCapability {
        read_bookmark: Arc::new({
            let state = state.clone();
            move || {
                let state = state.clone();
                let future: ClipboardBookmarkFuture = Box::pin(async move {
                    let state = state.lock().unwrap();
                    if state.rejected {
                        return Err(rejected_error());
                    }
                    if state.denied {
                        return Ok(None);
                    }
                    return Ok(state.bookmark.clone());
                });
                return future;
            }
        }),
        write_bookmark: Arc::new({
            let state = state.clone();
            move |title: String, url: String| {
                let state = state.clone();
                let future: ClipboardBoolFuture = Box::pin(async move {
                    let mut state = state.lock().unwrap();
                    if state.rejected {
                        return Err(rejected_error());
                    }
                    if state.denied {
                        return Ok(false);
                    }
                    state.bookmark = Some(ClipboardBookmark { title, url });
                    return Ok(true);
                });
                return future;
            }
        }),
    };

    let listeners_state = state.clone();
    let change = HostClipboardChangeSubscriber {
        subscribe: Arc::new(move |callback: Arc<dyn Fn() + Send + Sync>| {
            let mut locked = listeners_state.lock().unwrap();
            locked.listeners.push(Some(callback));
            let index = locked.listeners.len() - 1;
            drop(locked);
            let unsubscribe_state = listeners_state.clone();
            let unsubscribe: ClipboardUnsubscribe = Arc::new(move || {
                unsubscribe_state.lock().unwrap().listeners[index] = None;
            });
            return unsubscribe;
        }),
    };

    let format_state = state.clone();
    let formats = HostClipboardFormatsCapability {
        get_formats: Arc::new({
            let state = format_state.clone();
            move || {
                let state = state.clone();
                let future: ClipboardStringsFuture = Box::pin(async move {
                    let state = state.lock().unwrap();
                    if state.rejected {
                        return Err(rejected_error());
                    }
                    if state.denied {
                        return Ok(Vec::new());
                    }
                    return Ok(formats_of(&state));
                });
                return future;
            }
        }),
        has_format: Arc::new({
            let state = format_state.clone();
            move |format: String| {
                let state = state.clone();
                let future: ClipboardBoolFuture = Box::pin(async move {
                    let state = state.lock().unwrap();
                    if state.rejected {
                        return Err(rejected_error());
                    }
                    if state.denied {
                        return Ok(false);
                    }
                    return Ok(formats_of(&state).contains(&format));
                });
                return future;
            }
        }),
        read_format: Arc::new({
            let state = format_state.clone();
            move |format: String| {
                let state = state.clone();
                let future: ClipboardStringFuture = Box::pin(async move {
                    let state = state.lock().unwrap();
                    if state.rejected {
                        return Err(rejected_error());
                    }
                    if state.denied {
                        return Ok(String::new());
                    }
                    return Ok(read_format_of(&state, &format));
                });
                return future;
            }
        }),
        read_html: Arc::new({
            let state = format_state.clone();
            move || {
                let state = state.clone();
                let future: ClipboardStringFuture = Box::pin(async move {
                    let state = state.lock().unwrap();
                    if state.rejected {
                        return Err(rejected_error());
                    }
                    if state.denied {
                        return Ok(String::new());
                    }
                    return Ok(state.html.clone());
                });
                return future;
            }
        }),
        read_items: Arc::new({
            let state = format_state.clone();
            move |formats: Vec<String>| {
                let state = state.clone();
                let future: ClipboardItemsFuture = Box::pin(async move {
                    let mut result: Record<String> = empty_record();
                    let state = state.lock().unwrap();
                    if state.rejected {
                        return Err(rejected_error());
                    }
                    if state.denied {
                        return Ok(result);
                    }
                    for format in formats {
                        let data = read_format_of(&state, &format);
                        if !data.is_empty() {
                            set_record_value(&mut result, format, data);
                        }
                    }
                    return Ok(result);
                });
                return future;
            }
        }),
        read_rtf: Arc::new({
            let state = format_state.clone();
            move || {
                let state = state.clone();
                let future: ClipboardStringFuture = Box::pin(async move {
                    let state = state.lock().unwrap();
                    if state.rejected {
                        return Err(rejected_error());
                    }
                    if state.denied {
                        return Ok(String::new());
                    }
                    return Ok(state.rtf.clone());
                });
                return future;
            }
        }),
        write_format: Arc::new({
            let state = format_state.clone();
            move |format: String, data: String| {
                let state = state.clone();
                let future: ClipboardBoolFuture = Box::pin(async move {
                    let mut state = state.lock().unwrap();
                    if state.rejected {
                        return Err(rejected_error());
                    }
                    if state.denied {
                        return Ok(false);
                    }
                    write_format_into(&mut state, &format, &data);
                    return Ok(true);
                });
                return future;
            }
        }),
        write_html: Arc::new({
            let state = format_state.clone();
            move |html: String| {
                let state = state.clone();
                let future: ClipboardBoolFuture = Box::pin(async move {
                    let mut state = state.lock().unwrap();
                    if state.rejected {
                        return Err(rejected_error());
                    }
                    if state.denied {
                        return Ok(false);
                    }
                    state.html = html;
                    return Ok(true);
                });
                return future;
            }
        }),
        write_items: Arc::new({
            let state = format_state.clone();
            move |items: Vec<ClipboardWriteItem>| {
                let state = state.clone();
                let future: ClipboardBoolFuture = Box::pin(async move {
                    let mut locked = state.lock().unwrap();
                    if locked.rejected {
                        return Err(rejected_error());
                    }
                    if locked.denied {
                        return Ok(false);
                    }
                    for item in items {
                        write_format_into(&mut locked, &item.format, &item.data);
                    }
                    return Ok(true);
                });
                return future;
            }
        }),
        write_rtf: Arc::new({
            let state = format_state.clone();
            move |rtf: String| {
                let state = state.clone();
                let future: ClipboardBoolFuture = Box::pin(async move {
                    let mut state = state.lock().unwrap();
                    if state.rejected {
                        return Err(rejected_error());
                    }
                    if state.denied {
                        return Ok(false);
                    }
                    state.rtf = rtf;
                    return Ok(true);
                });
                return future;
            }
        }),
    };

    let image_state = state.clone();
    let image = HostClipboardImageCapability {
        has_image: Arc::new({
            let state = image_state.clone();
            move || {
                let state = state.clone();
                let future: ClipboardBoolFuture = Box::pin(async move {
                    let state = state.lock().unwrap();
                    if state.rejected {
                        return Err(rejected_error());
                    }
                    return Ok(!state.denied && !state.image.is_empty());
                });
                return future;
            }
        }),
        read_image: Arc::new({
            let state = image_state.clone();
            move || {
                let state = state.clone();
                let future: ClipboardStringFuture = Box::pin(async move {
                    let state = state.lock().unwrap();
                    if state.rejected {
                        return Err(rejected_error());
                    }
                    if state.denied {
                        return Ok(String::new());
                    }
                    return Ok(state.image.clone());
                });
                return future;
            }
        }),
        write_image: Arc::new({
            let state = image_state.clone();
            move |data_url: String| {
                let state = state.clone();
                let future: ClipboardBoolFuture = Box::pin(async move {
                    let mut state = state.lock().unwrap();
                    if state.rejected {
                        return Err(rejected_error());
                    }
                    if state.denied {
                        return Ok(false);
                    }
                    state.image = data_url;
                    return Ok(true);
                });
                return future;
            }
        }),
    };

    let text_state = state.clone();
    let text = HostClipboardTextCapability {
        clear: Arc::new({
            let state = text_state.clone();
            move || {
                let state = state.clone();
                let future: ClipboardBoolFuture = Box::pin(async move {
                    let mut state = state.lock().unwrap();
                    if state.rejected {
                        return Err(rejected_error());
                    }
                    if state.denied {
                        return Ok(false);
                    }
                    state.bookmark = None;
                    state.custom = Vec::new();
                    state.html = String::new();
                    state.image = String::new();
                    state.rtf = String::new();
                    state.text = String::new();
                    return Ok(true);
                });
                return future;
            }
        }),
        has_text: Arc::new({
            let state = text_state.clone();
            move || {
                let state = state.clone();
                let future: ClipboardBoolFuture = Box::pin(async move {
                    let state = state.lock().unwrap();
                    if state.rejected {
                        return Err(rejected_error());
                    }
                    return Ok(!state.denied && !state.text.is_empty());
                });
                return future;
            }
        }),
        read_text: Arc::new({
            let state = text_state.clone();
            move || {
                let state = state.clone();
                let future: ClipboardStringFuture = Box::pin(async move {
                    let state = state.lock().unwrap();
                    if state.rejected {
                        return Err(rejected_error());
                    }
                    if state.denied {
                        return Ok(String::new());
                    }
                    return Ok(state.text.clone());
                });
                return future;
            }
        }),
        write_text: Arc::new({
            let state = text_state.clone();
            move |value: String| {
                let state = state.clone();
                let future: ClipboardBoolFuture = Box::pin(async move {
                    let mut state = state.lock().unwrap();
                    if state.rejected {
                        return Err(rejected_error());
                    }
                    if state.denied {
                        return Ok(false);
                    }
                    state.text = value;
                    return Ok(true);
                });
                return future;
            }
        }),
    };

    return FakeBackend {
        bookmark,
        change,
        formats,
        image,
        state,
        text,
    };
}

mod clear_clipboard {
    use super::*;

    #[test]
    fn clears_every_flavor_of_the_supplied_provider() {
        let backend = fake_backend(false);
        assert_eq!(
            block_on(write_clipboard_text(&backend.text, "plain")),
            Ok(true)
        );
        assert_eq!(
            block_on(write_clipboard_bookmark(
                &backend.bookmark,
                "Flight",
                "https://example.com"
            )),
            Ok(true)
        );
        assert_eq!(block_on(clear_clipboard(&backend.text)), Ok(true));
        assert_eq!(
            block_on(read_clipboard_text(&backend.text)),
            Ok(String::new())
        );
        assert_eq!(
            block_on(get_clipboard_formats(&backend.formats)),
            Ok(Vec::new())
        );
    }
}

mod clipboard_providers {
    use super::*;

    #[test]
    fn never_consults_another_host_when_two_clipboard_providers_coexist() {
        let first = fake_backend(false);
        let second = fake_backend(false);
        assert_eq!(
            block_on(write_clipboard_text(&first.text, "first")),
            Ok(true)
        );
        assert_eq!(
            block_on(write_clipboard_text(&second.text, "second")),
            Ok(true)
        );
        assert_eq!(
            block_on(read_clipboard_text(&first.text)),
            Ok("first".to_string())
        );
        assert_eq!(
            block_on(read_clipboard_text(&second.text)),
            Ok("second".to_string())
        );
    }

    #[test]
    fn a_watch_pins_to_the_supplied_host_until_explicitly_attached_elsewhere() {
        let first = fake_backend(false);
        let second = fake_backend(false);
        let mut watch = create_clipboard_watch();
        let changes = Arc::new(Mutex::new(0));
        let captured = changes.clone();
        connect_watch(&watch, captured);
        attach_clipboard_watch(&first.change, &mut watch);
        assert_eq!(listener_count(&first.state), 1);
        emit_listeners(&first.state);
        assert_eq!(*changes.lock().unwrap(), 1);
        attach_clipboard_watch(&second.change, &mut watch);
        assert_eq!(listener_count(&first.state), 0);
        assert_eq!(listener_count(&second.state), 1);
        emit_listeners(&first.state);
        emit_listeners(&second.state);
        assert_eq!(*changes.lock().unwrap(), 2);
        detach_clipboard_watch(&mut watch);
        assert_eq!(listener_count(&second.state), 0);
    }

    fn connect_watch(watch: &ClipboardWatch, changes: Arc<Mutex<usize>>) {
        flight_signals::connect_signal(
            &watch.on_change,
            Arc::new(move |_args: &()| *changes.lock().unwrap() += 1),
            None,
        );
    }
}

mod clipboard_rejections {
    use super::*;

    #[test]
    fn every_operation_propagates_the_provider_rejection_unchanged() {
        let backend = rejecting_backend();
        let error = rejected_error();
        let formats = [CLIPBOARD_FORMAT_TEXT.to_string()];
        let items = [ClipboardWriteItem {
            format: CLIPBOARD_FORMAT_TEXT.to_string(),
            data: "multi".to_string(),
        }];
        assert_eq!(block_on(clear_clipboard(&backend.text)), Err(error.clone()));
        assert_eq!(
            block_on(get_clipboard_formats(&backend.formats)),
            Err(error.clone())
        );
        assert_eq!(
            block_on(has_clipboard_bookmark(&backend.bookmark)),
            Err(error.clone())
        );
        assert_eq!(
            block_on(has_clipboard_format(
                &backend.formats,
                CLIPBOARD_FORMAT_TEXT
            )),
            Err(error.clone())
        );
        assert_eq!(
            block_on(has_clipboard_html(&backend.formats)),
            Err(error.clone())
        );
        assert_eq!(
            block_on(has_clipboard_image(&backend.image)),
            Err(error.clone())
        );
        assert_eq!(
            block_on(has_clipboard_rtf(&backend.formats)),
            Err(error.clone())
        );
        assert_eq!(
            block_on(has_clipboard_text(&backend.text)),
            Err(error.clone())
        );
        match block_on(read_clipboard(&backend.formats, &formats)) {
            Err(actual) => assert_eq!(actual, error.clone()),
            Ok(_) => panic!("expected the rejection"),
        }
        assert_eq!(
            block_on(read_clipboard_bookmark(&backend.bookmark)),
            Err(error.clone())
        );
        assert_eq!(
            block_on(read_clipboard_format(
                &backend.formats,
                CLIPBOARD_FORMAT_TEXT
            )),
            Err(error.clone())
        );
        assert_eq!(
            block_on(read_clipboard_html(&backend.formats)),
            Err(error.clone())
        );
        assert_eq!(
            block_on(read_clipboard_image(&backend.image)),
            Err(error.clone())
        );
        assert_eq!(
            block_on(read_clipboard_rtf(&backend.formats)),
            Err(error.clone())
        );
        assert_eq!(
            block_on(read_clipboard_text(&backend.text)),
            Err(error.clone())
        );
        assert_eq!(
            block_on(write_clipboard(&backend.formats, &items)),
            Err(error.clone())
        );
        assert_eq!(
            block_on(write_clipboard_bookmark(
                &backend.bookmark,
                "Flight",
                "https://example.com"
            )),
            Err(error.clone())
        );
        assert_eq!(
            block_on(write_clipboard_format(
                &backend.formats,
                "application/x-flight",
                "custom"
            )),
            Err(error.clone())
        );
        assert_eq!(
            block_on(write_clipboard_html(&backend.formats, "<b>html</b>")),
            Err(error.clone())
        );
        assert_eq!(
            block_on(write_clipboard_image(&backend.image, "data:image/png")),
            Err(error.clone())
        );
        assert_eq!(
            block_on(write_clipboard_rtf(&backend.formats, "rtf")),
            Err(error.clone())
        );
        assert_eq!(
            block_on(write_clipboard_text(&backend.text, "plain")),
            Err(error)
        );
    }
}

mod clipboard_sentinels {
    use super::*;

    #[test]
    fn forwards_access_denied_sentinels_as_ok_values_without_inventing_defaults() {
        let backend = fake_backend(true);
        assert_eq!(block_on(clear_clipboard(&backend.text)), Ok(false));
        assert_eq!(
            block_on(get_clipboard_formats(&backend.formats)),
            Ok(Vec::new())
        );
        assert_eq!(block_on(has_clipboard_text(&backend.text)), Ok(false));
        assert_eq!(block_on(has_clipboard_html(&backend.formats)), Ok(false));
        assert_eq!(block_on(has_clipboard_image(&backend.image)), Ok(false));
        assert_eq!(block_on(has_clipboard_rtf(&backend.formats)), Ok(false));
        assert_eq!(
            block_on(has_clipboard_bookmark(&backend.bookmark)),
            Ok(false)
        );
        assert_eq!(
            block_on(has_clipboard_format(
                &backend.formats,
                "application/x-flight"
            )),
            Ok(false)
        );
        assert_eq!(
            block_on(read_clipboard_text(&backend.text)),
            Ok(String::new())
        );
        assert_eq!(
            block_on(read_clipboard_html(&backend.formats)),
            Ok(String::new())
        );
        assert_eq!(
            block_on(read_clipboard_image(&backend.image)),
            Ok(String::new())
        );
        assert_eq!(
            block_on(read_clipboard_rtf(&backend.formats)),
            Ok(String::new())
        );
        assert_eq!(
            block_on(read_clipboard_bookmark(&backend.bookmark)),
            Ok(None)
        );
        assert_eq!(
            block_on(read_clipboard_format(
                &backend.formats,
                "application/x-flight"
            )),
            Ok(String::new())
        );
        match block_on(read_clipboard(
            &backend.formats,
            &[CLIPBOARD_FORMAT_TEXT.to_string()],
        )) {
            Ok(result) => assert!(
                {
                    let mut collected = Vec::new();
                    entries(&mut collected, &result);
                    collected
                }
                .is_empty()
            ),
            Err(_) => panic!("denied reads are sentinels, not rejections"),
        }
        assert_eq!(
            block_on(write_clipboard_text(&backend.text, "plain")),
            Ok(false)
        );
        assert_eq!(
            block_on(write_clipboard_format(
                &backend.formats,
                "application/x-flight",
                "custom"
            )),
            Ok(false)
        );
        assert_eq!(
            block_on(write_clipboard_html(&backend.formats, "<b>html</b>")),
            Ok(false)
        );
        assert_eq!(
            block_on(write_clipboard_image(&backend.image, "data:image/png")),
            Ok(false)
        );
        assert_eq!(
            block_on(write_clipboard_rtf(&backend.formats, "rtf")),
            Ok(false)
        );
        assert_eq!(
            block_on(write_clipboard_bookmark(
                &backend.bookmark,
                "Flight",
                "https://example.com"
            )),
            Ok(false)
        );
        assert_eq!(
            block_on(write_clipboard(
                &backend.formats,
                &[ClipboardWriteItem {
                    format: CLIPBOARD_FORMAT_TEXT.to_string(),
                    data: "multi".to_string(),
                }]
            )),
            Ok(false)
        );
    }
}

mod get_clipboard_formats {
    use super::*;

    #[test]
    fn lists_every_flavor_currently_on_the_clipboard() {
        let backend = fake_backend(false);
        assert_eq!(
            block_on(write_clipboard_text(&backend.text, "plain")),
            Ok(true)
        );
        assert_eq!(
            block_on(write_clipboard_html(&backend.formats, "<b>html</b>")),
            Ok(true)
        );
        assert_eq!(
            block_on(write_clipboard_image(
                &backend.image,
                "data:image/png;base64,AAAA"
            )),
            Ok(true)
        );
        assert_eq!(
            block_on(write_clipboard_rtf(&backend.formats, "{\\rtf1 rich}")),
            Ok(true)
        );
        assert_eq!(
            block_on(write_clipboard_format(
                &backend.formats,
                "application/x-flight",
                "custom"
            )),
            Ok(true)
        );
        let formats = block_on(get_clipboard_formats(&backend.formats)).unwrap();
        for expected in [
            CLIPBOARD_FORMAT_TEXT,
            CLIPBOARD_FORMAT_HTML,
            CLIPBOARD_FORMAT_IMAGE,
            CLIPBOARD_FORMAT_RTF,
            "application/x-flight",
        ] {
            assert!(
                formats.contains(&expected.to_string()),
                "missing {}",
                expected
            );
        }
    }
}

mod has_clipboard_bookmark {
    use super::*;

    #[test]
    fn tracks_a_written_bookmark() {
        let backend = fake_backend(false);
        assert_eq!(
            block_on(has_clipboard_bookmark(&backend.bookmark)),
            Ok(false)
        );
        assert_eq!(
            block_on(write_clipboard_bookmark(
                &backend.bookmark,
                "Flight",
                "https://example.com"
            )),
            Ok(true)
        );
        assert_eq!(
            block_on(has_clipboard_bookmark(&backend.bookmark)),
            Ok(true)
        );
    }
}

mod has_clipboard_format {
    use super::*;

    #[test]
    fn reports_presence_of_the_named_format() {
        let backend = fake_backend(false);
        assert_eq!(
            block_on(has_clipboard_format(
                &backend.formats,
                "application/x-flight"
            )),
            Ok(false)
        );
        assert_eq!(
            block_on(write_clipboard_format(
                &backend.formats,
                "application/x-flight",
                "custom"
            )),
            Ok(true)
        );
        assert_eq!(
            block_on(has_clipboard_format(
                &backend.formats,
                "application/x-flight"
            )),
            Ok(true)
        );
    }
}

mod has_clipboard_html {
    use super::*;

    #[test]
    fn tracks_written_html() {
        let backend = fake_backend(false);
        assert_eq!(block_on(has_clipboard_html(&backend.formats)), Ok(false));
        assert_eq!(
            block_on(write_clipboard_html(&backend.formats, "<b>html</b>")),
            Ok(true)
        );
        assert_eq!(block_on(has_clipboard_html(&backend.formats)), Ok(true));
    }
}

mod has_clipboard_image {
    use super::*;

    #[test]
    fn tracks_a_written_image() {
        let backend = fake_backend(false);
        assert_eq!(block_on(has_clipboard_image(&backend.image)), Ok(false));
        assert_eq!(
            block_on(write_clipboard_image(
                &backend.image,
                "data:image/png;base64,AAAA"
            )),
            Ok(true)
        );
        assert_eq!(block_on(has_clipboard_image(&backend.image)), Ok(true));
    }
}

mod has_clipboard_rtf {
    use super::*;

    #[test]
    fn tracks_written_rtf() {
        let backend = fake_backend(false);
        assert_eq!(block_on(has_clipboard_rtf(&backend.formats)), Ok(false));
        assert_eq!(
            block_on(write_clipboard_rtf(&backend.formats, "{\\rtf1 rich}")),
            Ok(true)
        );
        assert_eq!(block_on(has_clipboard_rtf(&backend.formats)), Ok(true));
    }
}

mod has_clipboard_text {
    use super::*;

    #[test]
    fn tracks_non_empty_text_only() {
        let backend = fake_backend(false);
        assert_eq!(block_on(has_clipboard_text(&backend.text)), Ok(false));
        assert_eq!(
            block_on(write_clipboard_text(&backend.text, "plain")),
            Ok(true)
        );
        assert_eq!(block_on(has_clipboard_text(&backend.text)), Ok(true));
        assert_eq!(block_on(write_clipboard_text(&backend.text, "")), Ok(true));
        assert_eq!(block_on(has_clipboard_text(&backend.text)), Ok(false));
    }
}

mod read_clipboard {
    use super::*;

    #[test]
    fn reads_multiple_formats_in_one_round_trip_and_omits_missing_ones() {
        let backend = fake_backend(false);
        assert_eq!(
            block_on(write_clipboard_text(&backend.text, "plain")),
            Ok(true)
        );
        assert_eq!(
            block_on(write_clipboard_format(
                &backend.formats,
                "application/x-flight",
                "custom"
            )),
            Ok(true)
        );
        let result = block_on(read_clipboard(
            &backend.formats,
            &[
                CLIPBOARD_FORMAT_TEXT.to_string(),
                "application/x-flight".to_string(),
                "missing".to_string(),
            ],
        ))
        .unwrap();
        assert_eq!(
            get_record_value(&result, CLIPBOARD_FORMAT_TEXT),
            Some(&"plain".to_string())
        );
        assert_eq!(
            get_record_value(&result, "application/x-flight"),
            Some(&"custom".to_string())
        );
        assert_eq!(
            {
                let mut collected = Vec::new();
                get_record_keys(&mut collected, &result);
                collected
            }
            .len(),
            2
        );
    }

    #[test]
    fn preserves_plain_object_key_order_and_in_place_replacement() {
        let backend = fake_backend(false);
        assert_eq!(
            block_on(write_clipboard_format(&backend.formats, "10", "ten")),
            Ok(true)
        );
        assert_eq!(
            block_on(write_clipboard_format(&backend.formats, "2", "two")),
            Ok(true)
        );
        assert_eq!(
            block_on(write_clipboard_format(&backend.formats, "alpha", "A")),
            Ok(true)
        );
        let result = block_on(read_clipboard(
            &backend.formats,
            &[
                "10".to_string(),
                "2".to_string(),
                "alpha".to_string(),
                "10".to_string(),
            ],
        ))
        .unwrap();
        assert_eq!(
            {
                let mut collected = Vec::new();
                get_record_keys(&mut collected, &result);
                collected
            },
            vec!["2".to_string(), "10".to_string(), "alpha".to_string()]
        );
        assert_eq!(get_record_value(&result, "10"), Some(&"ten".to_string()));
    }
}

mod read_clipboard_bookmark {
    use super::*;

    #[test]
    fn reads_a_written_title_and_url_pair() {
        let backend = fake_backend(false);
        assert_eq!(
            block_on(read_clipboard_bookmark(&backend.bookmark)),
            Ok(None)
        );
        assert_eq!(
            block_on(write_clipboard_bookmark(
                &backend.bookmark,
                "Flight",
                "https://example.com"
            )),
            Ok(true)
        );
        assert_eq!(
            block_on(read_clipboard_bookmark(&backend.bookmark)),
            Ok(Some(ClipboardBookmark {
                title: "Flight".to_string(),
                url: "https://example.com".to_string(),
            }))
        );
    }
}

mod read_clipboard_format {
    use super::*;

    #[test]
    fn reads_the_named_flavor() {
        let backend = fake_backend(false);
        assert_eq!(
            block_on(write_clipboard_format(
                &backend.formats,
                "application/x-flight",
                "custom"
            )),
            Ok(true)
        );
        assert_eq!(
            block_on(read_clipboard_format(
                &backend.formats,
                "application/x-flight"
            )),
            Ok("custom".to_string())
        );
        assert_eq!(
            block_on(read_clipboard_format(&backend.formats, "missing")),
            Ok(String::new())
        );
    }
}

mod read_clipboard_html {
    use super::*;

    #[test]
    fn reads_written_html() {
        let backend = fake_backend(false);
        assert_eq!(
            block_on(write_clipboard_html(&backend.formats, "<b>html</b>")),
            Ok(true)
        );
        assert_eq!(
            block_on(read_clipboard_html(&backend.formats)),
            Ok("<b>html</b>".to_string())
        );
    }
}

mod read_clipboard_image {
    use super::*;

    #[test]
    fn reads_a_written_data_url() {
        let backend = fake_backend(false);
        assert_eq!(
            block_on(write_clipboard_image(
                &backend.image,
                "data:image/png;base64,AAAA"
            )),
            Ok(true)
        );
        assert_eq!(
            block_on(read_clipboard_image(&backend.image)),
            Ok("data:image/png;base64,AAAA".to_string())
        );
    }
}

mod read_clipboard_rtf {
    use super::*;

    #[test]
    fn reads_written_rtf_markup() {
        let backend = fake_backend(false);
        assert_eq!(
            block_on(write_clipboard_rtf(&backend.formats, "{\\rtf1 rich}")),
            Ok(true)
        );
        assert_eq!(
            block_on(read_clipboard_rtf(&backend.formats)),
            Ok("{\\rtf1 rich}".to_string())
        );
    }
}

mod read_clipboard_text {
    use super::*;

    #[test]
    fn reads_written_plain_text() {
        let backend = fake_backend(false);
        assert_eq!(
            block_on(write_clipboard_text(&backend.text, "plain")),
            Ok(true)
        );
        assert_eq!(
            block_on(read_clipboard_text(&backend.text)),
            Ok("plain".to_string())
        );
    }
}

mod write_clipboard {
    use super::*;

    #[test]
    fn writes_every_item_atomically() {
        let backend = fake_backend(false);
        let items = [
            ClipboardWriteItem {
                format: CLIPBOARD_FORMAT_TEXT.to_string(),
                data: "multi-text".to_string(),
            },
            ClipboardWriteItem {
                format: CLIPBOARD_FORMAT_HTML.to_string(),
                data: "<b>multi</b>".to_string(),
            },
        ];
        assert_eq!(
            block_on(write_clipboard(&backend.formats, &items)),
            Ok(true)
        );
        assert_eq!(
            block_on(read_clipboard_text(&backend.text)),
            Ok("multi-text".to_string())
        );
        assert_eq!(
            block_on(read_clipboard_html(&backend.formats)),
            Ok("<b>multi</b>".to_string())
        );
    }
}

mod write_clipboard_bookmark {
    use super::*;

    #[test]
    fn writes_the_title_and_url_pair() {
        let backend = fake_backend(false);
        assert_eq!(
            block_on(write_clipboard_bookmark(
                &backend.bookmark,
                "Flight",
                "https://example.com"
            )),
            Ok(true)
        );
        let bookmark = block_on(read_clipboard_bookmark(&backend.bookmark)).unwrap();
        assert_eq!(
            bookmark.map(|value| value.title),
            Some("Flight".to_string())
        );
    }
}

mod write_clipboard_format {
    use super::*;

    #[test]
    fn writes_the_named_flavor() {
        let backend = fake_backend(false);
        assert_eq!(
            block_on(write_clipboard_format(
                &backend.formats,
                "application/x-flight",
                "custom"
            )),
            Ok(true)
        );
        assert_eq!(
            block_on(read_clipboard_format(
                &backend.formats,
                "application/x-flight"
            )),
            Ok("custom".to_string())
        );
    }
}

mod write_clipboard_html {
    use super::*;

    #[test]
    fn writes_html_through_the_formats_slot() {
        let backend = fake_backend(false);
        assert_eq!(
            block_on(write_clipboard_html(&backend.formats, "<b>html</b>")),
            Ok(true)
        );
        assert_eq!(
            block_on(read_clipboard_html(&backend.formats)),
            Ok("<b>html</b>".to_string())
        );
    }
}

mod write_clipboard_image {
    use super::*;

    #[test]
    fn writes_an_image_data_url() {
        let backend = fake_backend(false);
        assert_eq!(
            block_on(write_clipboard_image(
                &backend.image,
                "data:image/png;base64,AAAA"
            )),
            Ok(true)
        );
        assert_eq!(
            block_on(read_clipboard_image(&backend.image)),
            Ok("data:image/png;base64,AAAA".to_string())
        );
    }
}

mod write_clipboard_rtf {
    use super::*;

    #[test]
    fn writes_rtf_markup() {
        let backend = fake_backend(false);
        assert_eq!(
            block_on(write_clipboard_rtf(&backend.formats, "{\\rtf1 rich}")),
            Ok(true)
        );
        assert_eq!(
            block_on(read_clipboard_rtf(&backend.formats)),
            Ok("{\\rtf1 rich}".to_string())
        );
    }
}

mod write_clipboard_text {
    use super::*;

    #[test]
    fn writes_plain_text() {
        let backend = fake_backend(false);
        assert_eq!(
            block_on(write_clipboard_text(&backend.text, "plain")),
            Ok(true)
        );
        assert_eq!(
            block_on(read_clipboard_text(&backend.text)),
            Ok("plain".to_string())
        );
    }
}
