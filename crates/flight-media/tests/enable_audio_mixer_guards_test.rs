use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use flight_host::AudioDeviceHandle;
use flight_log::{
    LogData, LogStateRef, LogValue, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries, set_log_sink,
};

use super::*;

fn logger() -> (LogStateRef, flight_log::MemoryLogSink) {
    let state = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(16);
    set_log_sink(&state, Some(sink.sink.clone()));
    return (state, sink);
}

fn message(entry: &flight_log::LogEntry) -> String {
    let LogData::Record(data) = &entry.data else {
        return String::new();
    };
    let Some(LogValue::Str(message)) = data.get("message") else {
        return String::new();
    };
    return message.clone();
}

mod create_audio_mixer_guard_state {
    use super::*;

    #[test]
    fn creates_a_silent_caller_owned_slot() {
        let state = create_audio_mixer_guard_state();
        assert!(state.read().unwrap().guard.is_none());
    }
}

mod disable_audio_mixer_guards {
    use super::*;

    #[test]
    fn uninstalls_the_warning_hook() {
        let guards = create_audio_mixer_guard_state();
        let (logs, sink) = logger();
        enable_audio_mixer_guards(&guards, &logs, Arc::new(|| 1.0));
        disable_audio_mixer_guards(&guards);
        let (_, host) = mixer_host();
        set_audio_bus_gain(&host, &guards, &create_audio_bus(), 0.5);
        assert!(
            {
                let mut collected = Vec::new();
                get_memory_log_sink_entries(&mut collected, &sink);
                collected
            }
            .is_empty()
        );
    }
}

mod enable_audio_mixer_guards {
    use super::*;

    #[test]
    fn warns_once_per_operation_with_exact_channel_message_and_live_clock() {
        let ticks = Arc::new(AtomicUsize::new(0));
        let captured = ticks.clone();
        let guards = create_audio_mixer_guard_state();
        let (logs, sink) = logger();
        enable_audio_mixer_guards(
            &guards,
            &logs,
            Arc::new(move || captured.fetch_add(1, Ordering::SeqCst) as f64 + 10.0),
        );
        let (_, host) = mixer_host();
        let bus = create_audio_bus();
        bus.write().unwrap().name = "music".to_string();
        set_audio_bus_gain(&host, &guards, &bus, 0.5);
        set_audio_bus_gain(&host, &guards, &bus, 0.25);
        set_audio_bus_muted(&host, &guards, &bus, true);
        set_audio_bus_pan(&host, &guards, &bus, 0.1);
        let entries = {
            let mut collected = Vec::new();
            get_memory_log_sink_entries(&mut collected, &sink);
            collected
        };
        assert_eq!(entries.len(), 3);
        assert!(
            entries
                .iter()
                .all(|entry| entry.channel.as_deref() == Some("media"))
        );
        assert_eq!(
            (
                entries[0].timestamp_ms,
                entries[1].timestamp_ms,
                entries[2].timestamp_ms
            ),
            (10.0, 12.0, 13.0)
        );
        assert_eq!(
            message(&entries[0]),
            "setAudioBusGain: bus \"music\" belongs to no mixer, so the value was stored but reached no audio node and nothing changed audibly. Add the bus with addAudioBusToMixer(hostAudioMixer, mixer, bus) — or route a channel through it with routeAudioChannelToMixerBus(hostAudioMixer, mixer, channel, bus) — before setting its properties."
        );
    }

    #[test]
    fn stays_silent_for_a_bus_that_belongs_to_a_mixer() {
        let guards = create_audio_mixer_guard_state();
        let (logs, sink) = logger();
        enable_audio_mixer_guards(&guards, &logs, Arc::new(|| 1.0));
        let (_, host) = mixer_host();
        let mixer = create_audio_mixer(&host, AudioDeviceHandle(1), None);
        let bus = create_audio_bus();
        add_audio_bus_to_mixer(&host, &mixer, &bus);
        set_audio_bus_gain(&host, &guards, &bus, 0.5);
        assert!(
            {
                let mut collected = Vec::new();
                get_memory_log_sink_entries(&mut collected, &sink);
                collected
            }
            .is_empty()
        );
    }
}
