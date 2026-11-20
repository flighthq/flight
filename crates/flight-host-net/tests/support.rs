//! A loopback HTTP/1.1 server started by each test, and a deadline-bounded executor. Nothing here
//! reaches beyond 127.0.0.1.

use std::future::Future;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::task::{Context, Poll, Wake, Waker};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use flight_entity::{Record, Ref, set_record_value};
use flight_net::{NetBody, NetRequest, NetResponse, NetResponseBody, NetState};

/// One request as the loopback server received it. Header names are lowercased.
#[derive(Clone, Debug)]
pub struct ReceivedRequest {
    pub body: Vec<u8>,
    pub headers: Vec<(String, String)>,
    pub method: String,
    pub path: String,
}

impl ReceivedRequest {
    pub fn header(&self, name: &str) -> Option<&str> {
        return self
            .headers
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str());
    }
}

/// What the loopback server sends back for one request.
pub enum Reply {
    /// A complete response with a `Content-Length` header added.
    Full {
        status: u16,
        reason: &'static str,
        headers: Vec<(&'static str, String)>,
        body: Vec<u8>,
    },
    /// Sends `head_and_part` bytes, then holds the connection open for `hold` without finishing.
    Stall {
        head_and_part: Vec<u8>,
        hold: Duration,
    },
    /// Writes raw bytes and closes.
    Raw(Vec<u8>),
    /// Declares `chunk.len() * count` bytes, then writes `chunk` every `interval`, stopping early
    /// when the client goes away.
    Trickle {
        chunk: Vec<u8>,
        count: usize,
        interval: Duration,
    },
}

/// What the server saw happen to its connections.
#[derive(Default)]
pub struct ConnectionEvents {
    pub accepted: AtomicUsize,
    /// Connections the client closed while the server waited for its next request.
    pub closed_by_client: AtomicUsize,
    /// Trickled bodies cut short because the client stopped reading.
    pub abandoned_bodies: AtomicUsize,
}

pub type Handler = Arc<dyn Fn(&ReceivedRequest) -> Reply + Send + Sync>;

/// A server on an ephemeral loopback port. Dropping it stops the accept loop and joins it.
pub struct LoopbackServer {
    pub events: Arc<ConnectionEvents>,
    pub port: u16,
    pub received: Arc<Mutex<Vec<ReceivedRequest>>>,
    stopping: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl LoopbackServer {
    pub fn accepted(&self) -> usize {
        return self.events.accepted.load(Ordering::SeqCst);
    }

    pub fn abandoned_bodies(&self) -> usize {
        return self.events.abandoned_bodies.load(Ordering::SeqCst);
    }

    pub fn closed_by_client(&self) -> usize {
        return self.events.closed_by_client.load(Ordering::SeqCst);
    }

    pub fn received(&self) -> Vec<ReceivedRequest> {
        return self.received.lock().unwrap().clone();
    }

    pub fn url(&self, path: &str) -> String {
        return format!("http://127.0.0.1:{}{}", self.port, path);
    }
}

impl Drop for LoopbackServer {
    fn drop(&mut self) {
        self.stopping.store(true, Ordering::SeqCst);
        // Wake the blocking accept so the loop sees the flag.
        let _ = TcpStream::connect(("127.0.0.1", self.port));
        if let Some(thread) = self.thread.take() {
            thread.join().expect("loopback server thread panicked");
        }
    }
}

/// Polls `future` on this thread until it completes, failing the test with `label` if it takes
/// longer than `deadline`.
pub fn block_on_within<F: Future>(label: &str, deadline: Duration, future: F) -> F::Output {
    let mut future = Box::pin(future);
    let parker = Arc::new(ThreadParker(std::thread::current()));
    let waker = Waker::from(parker);
    let mut context = Context::from_waker(&waker);
    let started = Instant::now();
    loop {
        if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
            return value;
        }
        let elapsed = started.elapsed();
        assert!(
            elapsed < deadline,
            "{label}: no response within {deadline:?} (waited {elapsed:?})"
        );
        std::thread::park_timeout(deadline - elapsed);
    }
}

pub fn create_get_request(url: &str) -> Ref<NetRequest> {
    return Arc::new(RwLock::new(NetRequest {
        method: "GET".to_string(),
        url: url.to_string(),
        headers: None,
        body: None,
        response_type: None,
        timeout_ms: Some(TEST_TIMEOUT_MS),
        credentials: None,
        redirect: None,
    }));
}

/// A default net state: no guard installed.
pub fn create_unguarded_net_state() -> NetState {
    return NetState::default();
}

pub fn create_headers(pairs: &[(&str, &str)]) -> Ref<Record<String>> {
    let mut record = Record::default();
    for (name, value) in pairs {
        set_record_value(&mut record, name.to_string(), value.to_string());
    }
    return Arc::new(RwLock::new(record));
}

pub fn create_text_body(text: &str) -> Option<Option<NetBody>> {
    return Some(Some(NetBody::Text(text.to_string())));
}

/// Deterministic bytes covering every byte value, generated by the test.
pub fn generate_payload(length: usize) -> Vec<u8> {
    let mut state: u32 = 0x2545_f491;
    return (0..length)
        .map(|index| {
            state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            return if index < 256 {
                index as u8
            } else {
                (state >> 24) as u8
            };
        })
        .collect();
}

pub fn get_response_bytes(response: &NetResponse) -> Vec<u8> {
    return match response.body.as_ref() {
        Some(NetResponseBody::Buffer(buffer)) => flight_buffer::get_array_buffer_storage(buffer)
            .read()
            .unwrap()
            .to_vec(),
        Some(NetResponseBody::Text(text)) => text.as_bytes().to_vec(),
        _ => panic!("response body is not bytes or text"),
    };
}

/// Encodes `data` as a gzip member using stored (uncompressed) deflate blocks, written here from
/// the gzip and deflate formats so the test needs no compression library.
pub fn encode_gzip_stored(data: &[u8]) -> Vec<u8> {
    let mut out = vec![0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0xff];
    let blocks: Vec<&[u8]> = if data.is_empty() {
        vec![&[]]
    } else {
        data.chunks(65_535).collect()
    };
    for (index, block) in blocks.iter().enumerate() {
        out.push(u8::from(index + 1 == blocks.len()));
        let length = block.len() as u16;
        out.extend_from_slice(&length.to_le_bytes());
        out.extend_from_slice(&(!length).to_le_bytes());
        out.extend_from_slice(block);
    }
    let mut crc: u32 = !0;
    for byte in data {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = if crc & 1 == 1 {
                (crc >> 1) ^ 0xEDB8_8320
            } else {
                crc >> 1
            };
        }
    }
    out.extend_from_slice(&(!crc).to_le_bytes());
    out.extend_from_slice(&(data.len() as u32).to_le_bytes());
    return out;
}

pub fn ok_reply(body: &[u8]) -> Reply {
    return Reply::Full {
        status: 200,
        reason: "OK",
        headers: vec![],
        body: body.to_vec(),
    };
}

pub fn start_loopback_server(handler: Handler) -> LoopbackServer {
    let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind loopback server");
    let port = listener.local_addr().unwrap().port();
    let received = Arc::new(Mutex::new(Vec::new()));
    let stopping = Arc::new(AtomicBool::new(false));
    let events = Arc::new(ConnectionEvents::default());
    let thread_events = events.clone();
    let thread_received = received.clone();
    let thread_stopping = stopping.clone();
    let thread = std::thread::spawn(move || {
        let mut connections = Vec::new();
        for stream in listener.incoming() {
            if thread_stopping.load(Ordering::SeqCst) {
                break;
            }
            let Ok(stream) = stream else {
                continue;
            };
            thread_events.accepted.fetch_add(1, Ordering::SeqCst);
            let handler = handler.clone();
            let received = thread_received.clone();
            let stopping = thread_stopping.clone();
            let events = thread_events.clone();
            connections.push(std::thread::spawn(move || {
                serve_loopback_connection(stream, &handler, &received, &stopping, &events);
            }));
        }
        for connection in connections {
            let _ = connection.join();
        }
    });
    return LoopbackServer {
        events,
        port,
        received,
        stopping,
        thread: Some(thread),
    };
}

struct ThreadParker(std::thread::Thread);

impl Wake for ThreadParker {
    fn wake(self: Arc<Self>) {
        self.0.unpark();
    }
}

/// Reads the next request. `Err(true)` means the client closed the connection cleanly between
/// requests; `Err(false)` is any other end.
fn read_loopback_request(reader: &mut BufReader<TcpStream>) -> Result<ReceivedRequest, bool> {
    let mut line = String::new();
    match reader.read_line(&mut line) {
        Ok(0) => return Err(true),
        Ok(_) => {}
        Err(_) => return Err(false),
    }
    return parse_loopback_request(reader, &line).ok_or(false);
}

fn parse_loopback_request(
    reader: &mut BufReader<TcpStream>,
    line: &str,
) -> Option<ReceivedRequest> {
    let mut parts = line.trim_end().splitn(3, ' ');
    let method = parts.next()?.to_string();
    let path = parts.next()?.to_string();
    let mut headers = Vec::new();
    loop {
        let mut header = String::new();
        reader.read_line(&mut header).ok()?;
        let header = header.trim_end();
        if header.is_empty() {
            break;
        }
        let (name, value) = header.split_once(':')?;
        headers.push((name.trim().to_ascii_lowercase(), value.trim().to_string()));
    }
    let length = headers
        .iter()
        .find(|(name, _)| name == "content-length")
        .and_then(|(_, value)| value.parse::<usize>().ok())
        .unwrap_or(0);
    let mut body = vec![0u8; length];
    reader.read_exact(&mut body).ok()?;
    return Some(ReceivedRequest {
        body,
        headers,
        method,
        path,
    });
}

fn serve_loopback_connection(
    stream: TcpStream,
    handler: &Handler,
    received: &Mutex<Vec<ReceivedRequest>>,
    stopping: &AtomicBool,
    events: &ConnectionEvents,
) {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    let mut writer = stream.try_clone().unwrap();
    let mut reader = BufReader::new(stream);
    while !stopping.load(Ordering::SeqCst) {
        let request = match read_loopback_request(&mut reader) {
            Ok(request) => request,
            Err(closed_by_client) => {
                if closed_by_client {
                    events.closed_by_client.fetch_add(1, Ordering::SeqCst);
                }
                break;
            }
        };
        received.lock().unwrap().push(request.clone());
        match handler(&request) {
            Reply::Full {
                status,
                reason,
                headers,
                body,
            } => {
                let mut head = format!("HTTP/1.1 {status} {reason}\r\n");
                for (name, value) in headers {
                    head.push_str(&format!("{name}: {value}\r\n"));
                }
                head.push_str(&format!("content-length: {}\r\n\r\n", body.len()));
                if writer.write_all(head.as_bytes()).is_err() {
                    break;
                }
                if request.method != "HEAD" && writer.write_all(&body).is_err() {
                    break;
                }
            }
            Reply::Stall {
                head_and_part,
                hold,
            } => {
                let _ = writer.write_all(&head_and_part);
                let until = Instant::now() + hold;
                while Instant::now() < until && !stopping.load(Ordering::SeqCst) {
                    std::thread::sleep(Duration::from_millis(10));
                }
                break;
            }
            Reply::Raw(bytes) => {
                let _ = writer.write_all(&bytes);
                break;
            }
            Reply::Trickle {
                chunk,
                count,
                interval,
            } => {
                let head = format!(
                    "HTTP/1.1 200 OK\r\ncontent-length: {}\r\n\r\n",
                    chunk.len() * count
                );
                let _ = writer.write_all(head.as_bytes());
                for _ in 0..count {
                    if stopping.load(Ordering::SeqCst) {
                        break;
                    }
                    if writer
                        .write_all(&chunk)
                        .and_then(|_| writer.flush())
                        .is_err()
                    {
                        events.abandoned_bodies.fetch_add(1, Ordering::SeqCst);
                        break;
                    }
                    std::thread::sleep(interval);
                }
                break;
            }
        }
    }
    let _ = writer.shutdown(Shutdown::Both);
}

/// Polls `condition` until it holds, failing the test with `label` after `bound`.
pub fn wait_until(label: &str, bound: Duration, condition: impl Fn() -> bool) {
    let started = Instant::now();
    while !condition() {
        assert!(
            started.elapsed() < bound,
            "{label}: not reached within {bound:?}"
        );
        std::thread::sleep(Duration::from_millis(5));
    }
}

/// Per-request timeout every test request carries, so no test can hang on the network.
pub const TEST_TIMEOUT_MS: f32 = 10_000.0;
/// How long a test waits for any one response future.
pub const TEST_DEADLINE: Duration = Duration::from_secs(15);
