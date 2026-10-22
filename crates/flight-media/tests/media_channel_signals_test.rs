use std::sync::{Arc, Mutex};

use flight_audio::AudioPlayOptions;
use flight_host::AudioDeviceHandle;
use flight_signals::connect_signal;

use super::*;

mod enable_audio_channel_signals {
    use super::*;

    #[test]
    fn returns_the_same_identity_and_reports_driven_lifecycle_events() {
        let (_, host) = audio_host();
        let channel =
            play_audio_resource(&host, AudioDeviceHandle(1), &audio_resource(), None).unwrap();
        let signals = enable_audio_channel_signals(&channel);
        assert!(Arc::ptr_eq(
            &signals,
            &enable_audio_channel_signals(&channel)
        ));
        let seen = Arc::new(Mutex::new(Vec::new()));
        let pause_seen = seen.clone();
        let play_seen = seen.clone();
        let stop_seen = seen.clone();
        connect_signal(
            &signals.read().unwrap().on_pause,
            Arc::new(move |_| pause_seen.lock().unwrap().push("pause")),
            None,
        );
        connect_signal(
            &signals.read().unwrap().on_play,
            Arc::new(move |_| play_seen.lock().unwrap().push("play")),
            None,
        );
        connect_signal(
            &signals.read().unwrap().on_stop,
            Arc::new(move |_| stop_seen.lock().unwrap().push("stop")),
            None,
        );
        pause_audio_channel(&channel);
        resume_audio_channel(&channel);
        stop_audio_channel(&channel);
        assert_eq!(*seen.lock().unwrap(), vec!["pause", "play", "stop"]);
    }

    #[test]
    fn reports_loop_then_completion_without_a_loop_play_event() {
        let (state, host) = audio_host();
        let options = AudioPlayOptions {
            current_time: None,
            gain: None,
            loops: Some(1),
            playback_rate: None,
        };
        let channel = play_audio_resource(
            &host,
            AudioDeviceHandle(1),
            &audio_resource(),
            Some(&options),
        )
        .unwrap();
        let signals = enable_audio_channel_signals(&channel);
        let seen = Arc::new(Mutex::new(Vec::new()));
        let loop_seen = seen.clone();
        let complete_seen = seen.clone();
        let play_seen = seen.clone();
        connect_signal(
            &signals.read().unwrap().on_loop,
            Arc::new(move |_| loop_seen.lock().unwrap().push("loop")),
            None,
        );
        connect_signal(
            &signals.read().unwrap().on_complete,
            Arc::new(move |_| complete_seen.lock().unwrap().push("complete")),
            None,
        );
        connect_signal(
            &signals.read().unwrap().on_play,
            Arc::new(move |_| play_seen.lock().unwrap().push("play")),
            None,
        );
        trigger_audio_end(&state);
        trigger_audio_end(&state);
        assert_eq!(*seen.lock().unwrap(), vec!["loop", "complete"]);
    }
}

mod enable_video_channel_signals {
    use super::*;

    #[test]
    fn remains_independent_per_video_channel() {
        let (_, host) = video_host();
        let spawn = immediate_spawn();
        let runtime_state = create_video_channel_runtime_state();
        let a =
            play_video_resource(&host, &spawn, &runtime_state, &video_resource(), None).unwrap();
        let b =
            play_video_resource(&host, &spawn, &runtime_state, &video_resource(), None).unwrap();
        let a_signals = enable_video_channel_signals(&a);
        let b_signals = enable_video_channel_signals(&b);
        assert!(!Arc::ptr_eq(&a_signals, &b_signals));
        assert!(Arc::ptr_eq(&a_signals, &enable_video_channel_signals(&a)));
    }
}

mod get_audio_channel_signals {
    use super::*;

    #[test]
    fn returns_none_until_opt_in_and_survives_stop() {
        let (_, host) = audio_host();
        let channel =
            play_audio_resource(&host, AudioDeviceHandle(1), &audio_resource(), None).unwrap();
        assert!(get_audio_channel_signals(&channel).is_none());
        let signals = enable_audio_channel_signals(&channel);
        stop_audio_channel(&channel);
        assert!(Arc::ptr_eq(
            &signals,
            &get_audio_channel_signals(&channel).unwrap()
        ));
    }
}

mod get_video_channel_signals {
    use super::*;

    #[test]
    fn returns_none_until_opt_in() {
        let (_, host) = video_host();
        let channel = play_video_resource(
            &host,
            &immediate_spawn(),
            &create_video_channel_runtime_state(),
            &video_resource(),
            None,
        )
        .unwrap();
        assert!(get_video_channel_signals(&channel).is_none());
        let signals = enable_video_channel_signals(&channel);
        assert!(Arc::ptr_eq(
            &signals,
            &get_video_channel_signals(&channel).unwrap()
        ));
    }
}
