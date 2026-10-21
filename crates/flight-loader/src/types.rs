use flight_entity::Ref;
use flight_net::NetProgressPhase;
use flight_signals::Signal;
use flight_stream::AbortSignal;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LoadProgress {
    pub url: String,
    pub loaded: usize,
    pub total: usize,
    pub phase: NetProgressPhase,
}

#[derive(Clone, Default)]
pub struct LoadOptions {
    pub signal: Option<AbortSignal>,
    pub progress: Option<Ref<Signal<Ref<LoadProgress>>>>,
}
