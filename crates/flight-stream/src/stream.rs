use std::future::Future;
use std::pin::Pin;

use flight_entity::{FlightError, FlightErrorKind, Uint8Array};
use futures::FutureExt;
use futures::future::Shared;
use futures::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

/// One result modeled as an asynchronous operation failure (D10/D15).
// flight-lint: allow(contract-vocabulary) D15/D10: an IO rejection at the vocabulary stream boundary needs an explicit FlightError arm
pub type StreamResult<T> = Result<T, FlightError>;

/// A TS Promise stored in a field (D20). Cloneable and executor-neutral: every clone observes the
/// same result, and the underlying operation runs once. Use `Ref<T>`/`Arc<T>` as the output when
/// the value itself is not `Clone`. Returned promises stay `async fn`, not this type.
// flight-lint: allow(contract-vocabulary) D20: futures::future::Shared is the implementation behind the SharedFuture vocabulary row
pub type SharedFuture<T> = Shared<Pin<Box<dyn Future<Output = T> + Send>>>;

/// A byte stream read from a host provider (D20; TS `ReadableStream<Uint8Array>`). Ownership is
/// the lock: an exclusive borrow reads, the caller's buffer is the BYOB view, and pull polling is
/// backpressure. Dropping the stream is cancellation; the source Exposes no separate close.
pub struct ReadableStream {
    inner: Box<dyn AsyncRead + Send + Unpin>,
}

/// A byte stream written to a host provider (D20; TS `WritableStream<Uint8Array>`). Ownership is
/// the lock: an exclusive borrow writes and closes, partial writes are the pull backpressure
/// signal, and dropping the stream is abort.
pub struct WritableStream {
    inner: Box<dyn AsyncWrite + Send + Unpin>,
}

// flight-lint: allow(contract-vocabulary) D20: futures-io AsyncRead is the implementation type at the flight-stream construction boundary; the IR name is ReadableStream
pub fn create_readable_stream(reader: Box<dyn AsyncRead + Send + Unpin>) -> ReadableStream {
    return ReadableStream { inner: reader };
}

// flight-lint: allow(contract-vocabulary) D20: futures::future::Shared is the implementation behind the SharedFuture vocabulary row
pub fn create_shared_future<T: Clone>(
    future: Pin<Box<dyn Future<Output = T> + Send>>,
) -> SharedFuture<T> {
    return future.shared();
}

// flight-lint: allow(contract-vocabulary) D20: futures-io AsyncWrite is the implementation type at the flight-stream construction boundary; the IR name is WritableStream
pub fn create_writable_stream(writer: Box<dyn AsyncWrite + Send + Unpin>) -> WritableStream {
    return WritableStream { inner: writer };
}

/// Closes the writable end (TS writer `close`). The source exposes no separate readable close.
pub async fn close_writable_stream(stream: &mut WritableStream) -> StreamResult<()> {
    return match stream.inner.close().await {
        Ok(()) => Ok(()),
        Err(error) => Err(to_flight_error(error)),
    };
}

/// Reads into the caller's buffer (D9b out-first; BYOB). `Ok(0)` is end of stream; a partial
/// count means the provider has more to pull.
pub async fn read_readable_stream(
    out: &mut Uint8Array,
    stream: &mut ReadableStream,
) -> StreamResult<usize> {
    return match stream.inner.read(out).await {
        Ok(count) => Ok(count),
        Err(error) => Err(to_flight_error(error)),
    };
}

fn to_flight_error(error: std::io::Error) -> FlightError {
    return FlightError {
        kind: FlightErrorKind::Error,
        message: error.to_string(),
    };
}

/// Writes a chunk (D9 borrowed input). A count below the chunk length is the provider's pull
/// backpressure signal; callers write the remainder on the next pull.
pub async fn write_writable_stream(
    stream: &mut WritableStream,
    data: &Uint8Array,
) -> StreamResult<usize> {
    return match stream.inner.write(data).await {
        Ok(count) => Ok(count),
        Err(error) => Err(to_flight_error(error)),
    };
}
