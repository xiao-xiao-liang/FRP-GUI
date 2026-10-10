use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::io::{Error, ErrorKind};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::net::{lookup_host, TcpListener, TcpSocket, TcpStream};
use tokio::sync::watch;
use tokio::task::{JoinHandle, JoinSet};
use tokio::time::{interval_at, sleep_until, timeout, MissedTickBehavior};

const SAMPLE_INTERVAL: Duration = Duration::from_secs(1);
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);
const ADDRESS_FALLBACK_DELAY: Duration = Duration::from_millis(250);
const MAX_CONCURRENT_DIALS: usize = 2;
const MAX_CONNECTIONS: usize = 1024;
const COPY_BUFFER_SIZE: usize = 32 * 1024;
static LAST_STARTED_AT: AtomicU64 = AtomicU64::new(0);

type SampleCallback = Arc<dyn Fn(&RuntimeTrafficSample) + Send + Sync>;

#[derive(Default)]
struct ByteCounters {
    upload: AtomicU64,
    download: AtomicU64,
}

struct RateBaseline {
    instant: Instant,
    upload: u64,
    download: u64,
}

impl RateBaseline {
    fn new(instant: Instant, upload: u64, download: u64) -> Self {
        Self {
            instant,
            upload,
            download,
        }
    }

    fn sample(&mut self, now: Instant, upload: u64, download: u64) -> Option<(f64, f64)> {
        let elapsed = now.checked_duration_since(self.instant)?.as_secs_f64();
        if elapsed <= 0.0 {
            return None;
        }
        let rates = upload
            .checked_sub(self.upload)
            .zip(download.checked_sub(self.download))
            .map(|(up, down)| (up as f64 / elapsed, down as f64 / elapsed));
        self.instant = now;
        self.upload = upload;
        self.download = download;
        rates
    }
}

struct PreparedConfig {
    value: toml::Value,
    target: ServerTarget,
}

#[derive(Clone)]
struct ServerTarget {
    host: String,
    port: u16,
    ip: Option<IpAddr>,
}

enum RequestedHost {
    Ip(IpAddr),
    Domain(String),
}

fn canonical_ip(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V6(address) => address.to_ipv4_mapped().map(IpAddr::V4).unwrap_or(ip),
        IpAddr::V4(_) => ip,
    }
}

impl ServerTarget {
    fn allows(&self, requested: &RequestedHost, port: u16) -> bool {
        if port != self.port {
            return false;
        }
        match (self.ip, requested) {
            (Some(expected), RequestedHost::Ip(actual)) => {
                canonical_ip(expected) == canonical_ip(*actual)
            }
            (Some(expected), RequestedHost::Domain(actual)) => {
                actual.parse::<IpAddr>().map(canonical_ip) == Ok(canonical_ip(expected))
            }
            (None, RequestedHost::Domain(actual)) => self
                .host
                .trim_end_matches('.')
                .eq_ignore_ascii_case(actual.trim_end_matches('.')),
            (None, RequestedHost::Ip(_)) => false,
        }
    }
}

fn is_nonempty_setting(value: Option<&toml::Value>) -> bool {
    match value {
        None => false,
        Some(toml::Value::String(text)) => !text.is_empty(),
        Some(toml::Value::Array(values)) => !values.is_empty(),
        Some(_) => true,
    }
}

/// 仅检查已验证的数据路径，不更改原始配置或进程环境。
fn prepare_config(content: &str, inherited_proxy: bool) -> Result<PreparedConfig, &'static str> {
    if content.contains("{{") || content.contains("}}") {
        return Err("包含模板配置，首版暂不可采集");
    }
    let value = content
        .parse::<toml::Value>()
        .map_err(|_| "无法解析配置，暂不可采集")?;
    let root = value.as_table().ok_or("配置格式无法验证，暂不可采集")?;
    if inherited_proxy {
        return Err("检测到继承的 HTTP 代理，已保留原连接路径");
    }
    if is_nonempty_setting(root.get("includes")) {
        return Err("包含外部配置文件，首版暂不可采集");
    }
    if is_nonempty_setting(root.get("dnsServer"))
        || is_nonempty_setting(root.get("connectServerLocalIP"))
    {
        return Err("配置了自定义拨号设置，已保留原连接路径");
    }
    if is_nonempty_setting(root.get("visitors")) {
        return Err("包含访问者连接，首版暂不可采集");
    }
    let transport = match root.get("transport") {
        Some(value) => Some(value.as_table().ok_or("传输配置格式无法验证，暂不可采集")?),
        None => None,
    };
    if let Some(transport) = transport {
        if transport.contains_key("proxyURL") {
            return Err("配置了已有代理，已保留原连接路径");
        }
        if is_nonempty_setting(transport.get("connectServerLocalIP"))
            || is_nonempty_setting(transport.get("dnsServer"))
            || [
                "dialServerTimeout",
                "dialServerKeepalive",
                "dialServerKeepAlive",
            ]
            .iter()
            .any(|key| transport.contains_key(*key))
        {
            return Err("配置了自定义拨号设置，已保留原连接路径");
        }
        if let Some(protocol) = transport.get("protocol") {
            if protocol.as_str() != Some("tcp") {
                return Err("当前传输协议首版暂不可采集");
            }
        }
    }
    if let Some(proxies) = root.get("proxies") {
        for proxy in proxies
            .as_array()
            .ok_or("代理规则格式无法验证，暂不可采集")?
        {
            let proxy_type = proxy.get("type").and_then(toml::Value::as_str);
            if !matches!(proxy_type, Some("tcp" | "http" | "https")) {
                return Err("包含首版未支持的代理类型，暂不可采集");
            }
        }
    }
    let host = root
        .get("serverAddr")
        .and_then(toml::Value::as_str)
        .filter(|host| !host.is_empty())
        .ok_or("服务端地址无法验证，暂不可采集")?
        .to_string();
    let ip = host.parse::<IpAddr>().ok();
    if ip.is_none() {
        let domain = host.strip_suffix('.').unwrap_or(&host);
        if domain.len() > 253
            || domain.split('.').any(|label| {
                label.is_empty()
                    || label.len() > 63
                    || label.starts_with('-')
                    || label.ends_with('-')
                    || !label
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
            })
        {
            return Err("服务端地址无法验证，暂不可采集");
        }
    }
    let port = match root.get("serverPort") {
        Some(value) => value
            .as_integer()
            .and_then(|port| u16::try_from(port).ok())
            .filter(|port| *port > 0)
            .ok_or("服务端端口无法验证，暂不可采集")?,
        None => 7000,
    };
    Ok(PreparedConfig {
        value,
        target: ServerTarget { host, port, ip },
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeTrafficSample {
    pub profile_id: String,
    pub run_id: String,
    pub started_at: u64,
    pub sequence: u64,
    pub timestamp: u64,
    pub availability: String,
    pub upload_bytes_per_second: f64,
    pub download_bytes_per_second: f64,
    pub reason: Option<String>,
}

pub struct TrafficMonitor {
    sample: Arc<Mutex<RuntimeTrafficSample>>,
    counters: Arc<ByteCounters>,
    runtime_config: Option<String>,
    on_sample: SampleCallback,
    stop: Option<watch::Sender<bool>>,
    listener_task: Option<JoinHandle<()>>,
    sampler_task: Option<JoinHandle<()>>,
}

impl TrafficMonitor {
    /// 创建独立运行实例；不可采集时不生成改写配置，供调用方继续使用原配置。
    pub async fn start(profile_id: String, toml_content: &str, on_sample: SampleCallback) -> Self {
        let timestamp = current_timestamp();
        let previous = LAST_STARTED_AT
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |last| {
                Some(timestamp.max(last.saturating_add(1)))
            })
            .expect("运行标识时间更新始终成功");
        let started_at = timestamp.max(previous.saturating_add(1));
        let sample = RuntimeTrafficSample {
            profile_id,
            run_id: uuid::Uuid::new_v4().to_string(),
            started_at,
            sequence: 1,
            timestamp,
            availability: "collecting".to_string(),
            upload_bytes_per_second: 0.0,
            download_bytes_per_second: 0.0,
            reason: None,
        };
        let mut monitor = Self {
            sample: Arc::new(Mutex::new(sample)),
            counters: Arc::new(ByteCounters::default()),
            runtime_config: None,
            on_sample,
            stop: None,
            listener_task: None,
            sampler_task: None,
        };
        let inherited_proxy = ["http_proxy", "HTTP_PROXY"]
            .iter()
            .any(|key| std::env::var_os(key).is_some_and(|value| !value.is_empty()));
        let mut prepared = match prepare_config(toml_content, inherited_proxy) {
            Ok(config) => config,
            Err(reason) => {
                monitor.set_initial_unavailable(reason);
                return monitor;
            }
        };
        let listener = match TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await {
            Ok(listener) => listener,
            Err(_) => {
                monitor.set_initial_unavailable("无法创建本机计量中转，已保留原连接路径");
                return monitor;
            }
        };
        let address = match listener.local_addr() {
            Ok(address) => address,
            Err(_) => {
                monitor.set_initial_unavailable("无法取得本机计量端口，已保留原连接路径");
                return monitor;
            }
        };
        let username = uuid::Uuid::new_v4().simple().to_string();
        let password = uuid::Uuid::new_v4().simple().to_string();
        let root = prepared.value.as_table_mut().expect("已验证配置必须是表");
        let transport = root
            .entry("transport")
            .or_insert_with(|| toml::Value::Table(toml::Table::new()))
            .as_table_mut()
            .expect("已验证传输配置必须是表");
        transport.insert(
            "proxyURL".to_string(),
            toml::Value::String(format!("socks5://{username}:{password}@{address}")),
        );
        monitor.runtime_config = match toml::to_string(&prepared.value) {
            Ok(content) => Some(content),
            Err(_) => {
                monitor.set_initial_unavailable("无法生成临时计量配置，已保留原连接路径");
                return monitor;
            }
        };
        (monitor.on_sample)(&monitor.snapshot());

        let (stop, stop_rx) = watch::channel(false);
        let counters = monitor.counters.clone();
        let sample = monitor.sample.clone();
        let callback = monitor.on_sample.clone();
        let sampling_started = Instant::now();
        monitor.listener_task = Some(tokio::spawn(run_listener(
            listener,
            prepared.target,
            username,
            password,
            counters,
            sample,
            callback,
            stop_rx.clone(),
        )));
        monitor.sampler_task = Some(tokio::spawn(run_sampler(
            monitor.counters.clone(),
            monitor.sample.clone(),
            monitor.on_sample.clone(),
            stop_rx,
            sampling_started,
        )));
        monitor.stop = Some(stop);
        monitor
    }

    pub fn runtime_toml(&self) -> Option<&str> {
        self.runtime_config.as_deref()
    }

    pub fn snapshot(&self) -> RuntimeTrafficSample {
        self.sample.lock().expect("流量快照锁不应中毒").clone()
    }

    /// 等待监听和所有子连接退出，随后发布停止样本。
    pub async fn shutdown(&mut self) {
        self.close_tasks().await;
        self.runtime_config = None;
        if self.snapshot().availability != "stopped" {
            publish(&self.sample, &self.on_sample, "stopped", (0.0, 0.0), None);
        }
    }

    /// 启动前回退到原连接配置时使用，同一次运行保持标识和递增序号。
    pub async fn disable(&mut self, reason: &str) {
        self.close_tasks().await;
        self.runtime_config = None;
        publish(
            &self.sample,
            &self.on_sample,
            "unavailable",
            (0.0, 0.0),
            Some(reason.to_string()),
        );
    }

    fn set_initial_unavailable(&mut self, reason: &str) {
        {
            let mut sample = self.sample.lock().expect("流量快照锁不应中毒");
            sample.availability = "unavailable".to_string();
            sample.reason = Some(reason.to_string());
        }
        (self.on_sample)(&self.snapshot());
    }

    async fn close_tasks(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(true);
        }
        if let Some(task) = self.listener_task.take() {
            if task.await.is_err() {
                log::warn!("本机计量监听任务未正常结束");
            }
        }
        if let Some(task) = self.sampler_task.take() {
            if task.await.is_err() {
                log::warn!("本机流量采样任务未正常结束");
            }
        }
    }
}

impl Drop for TrafficMonitor {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(true);
        }
        if let Some(task) = self.listener_task.take() {
            // 监听任务拥有 JoinSet，任务被取消时一并取消所有握手和转发子任务。
            task.abort();
        }
        if let Some(task) = self.sampler_task.take() {
            task.abort();
        }
    }
}

fn current_timestamp() -> u64 {
    chrono::Utc::now().timestamp_millis().max(0) as u64
}

fn publish(
    sample: &Arc<Mutex<RuntimeTrafficSample>>,
    on_sample: &SampleCallback,
    availability: &str,
    rates: (f64, f64),
    reason: Option<String>,
) {
    let next = {
        let mut sample = sample.lock().expect("流量快照锁不应中毒");
        sample.sequence += 1;
        sample.timestamp = current_timestamp();
        sample.availability = availability.to_string();
        sample.upload_bytes_per_second = rates.0;
        sample.download_bytes_per_second = rates.1;
        sample.reason = reason;
        sample.clone()
    };
    on_sample(&next);
}

async fn run_sampler(
    counters: Arc<ByteCounters>,
    sample: Arc<Mutex<RuntimeTrafficSample>>,
    on_sample: SampleCallback,
    mut stop: watch::Receiver<bool>,
    start: Instant,
) {
    let mut baseline = RateBaseline::new(start, 0, 0);
    let mut interval = interval_at(
        tokio::time::Instant::from_std(start) + SAMPLE_INTERVAL,
        SAMPLE_INTERVAL,
    );
    interval.set_missed_tick_behavior(MissedTickBehavior::Skip);
    loop {
        tokio::select! {
            biased;
            _ = stop.changed() => break,
            _ = interval.tick() => {
                let next = {
                    let mut sample = sample.lock().expect("流量快照锁不应中毒");
                    if sample.availability == "unavailable" {
                        break;
                    }
                    let rates = baseline.sample(Instant::now(),
                        counters.upload.load(Ordering::Relaxed), counters.download.load(Ordering::Relaxed));
                    sample.sequence += 1;
                    sample.timestamp = current_timestamp();
                    match rates {
                        Some((up, down)) => {
                            sample.availability = "available".to_string();
                            sample.upload_bytes_per_second = up;
                            sample.download_bytes_per_second = down;
                        }
                        None => {
                            sample.availability = "collecting".to_string();
                            sample.upload_bytes_per_second = 0.0;
                            sample.download_bytes_per_second = 0.0;
                        }
                    }
                    sample.clone()
                };
                if std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| on_sample(&next))).is_err() {
                    // 采样发布故障仅使数字失效，不能取消仍在转发的业务连接。
                    let mut sample = sample.lock().expect("流量快照锁不应中毒");
                    sample.sequence += 1;
                    sample.timestamp = current_timestamp();
                    sample.availability = "unavailable".to_string();
                    sample.upload_bytes_per_second = 0.0;
                    sample.download_bytes_per_second = 0.0;
                    sample.reason = Some("流量采样发布失败，当前流量不可用".to_string());
                    log::warn!("流量采样发布失败，已保留现有转发连接");
                    break;
                }
            }
        }
    }
}

async fn run_listener(
    listener: TcpListener,
    target: ServerTarget,
    username: String,
    password: String,
    counters: Arc<ByteCounters>,
    sample: Arc<Mutex<RuntimeTrafficSample>>,
    on_sample: SampleCallback,
    mut stop: watch::Receiver<bool>,
) {
    let mut connections = JoinSet::new();
    loop {
        tokio::select! {
            biased;
            _ = stop.changed() => break,
            Some(result) = connections.join_next(), if !connections.is_empty() => {
                if result.is_err() {
                    log::warn!("本机计量连接任务未正常结束");
                }
            }
            accepted = listener.accept() => {
                match accepted {
                    Ok((stream, _)) if connections.len() < MAX_CONNECTIONS => {
                        let target = target.clone();
                        let username = username.clone();
                        let password = password.clone();
                        let counters = counters.clone();
                        connections.spawn(async move {
                            relay_connection(stream, target, username, password, counters).await;
                        });
                    }
                    Ok((stream, _)) => {
                        // 限制同一实例的并发连接，避免本机握手占用无限增长。
                        drop(stream);
                    }
                    Err(_) => {
                        publish(&sample, &on_sample, "unavailable", (0.0, 0.0),
                            Some("本机计量中转监听失败，当前流量不可用".to_string()));
                        break;
                    }
                }
            }
        }
    }
    drop(listener);
    connections.abort_all();
    while connections.join_next().await.is_some() {}
}

async fn relay_connection(
    stream: TcpStream,
    target: ServerTarget,
    username: String,
    password: String,
    counters: Arc<ByteCounters>,
) {
    let (mut client, mut server) = match timeout(
        HANDSHAKE_TIMEOUT,
        establish_tunnel(stream, &target, &username, &password),
    )
    .await
    {
        Ok(Ok(streams)) => streams,
        // 单次认证、目标连接失败或超时仅关闭该连接，监听和其他业务连接继续工作。
        _ => return,
    };
    let (client_read, client_write) = client.split();
    let (server_read, server_write) = server.split();
    let _ = tokio::try_join!(
        copy_counted(client_read, server_write, &counters.upload),
        copy_counted(server_read, client_write, &counters.download),
    );
}

async fn socks_reply(stream: &mut TcpStream, status: u8) -> std::io::Result<()> {
    stream.write_all(&[5, status, 0, 1, 0, 0, 0, 0, 0, 0]).await
}

async fn connect_address(address: SocketAddr) -> std::io::Result<TcpStream> {
    let address = match (address, canonical_ip(address.ip())) {
        (SocketAddr::V6(_), IpAddr::V4(ip)) => SocketAddr::new(IpAddr::V4(ip), address.port()),
        _ => address,
    };
    let socket = if address.is_ipv6() {
        TcpSocket::new_v6()?
    } else {
        TcpSocket::new_v4()?
    };
    // 启用系统默认 TCP 保活；显式定制探测参数的配置由兼容性检查保留原路径。
    socket.set_keepalive(true)?;
    socket.connect(address).await
}

/// 保留 DNS 返回的首选地址族，同时及时尝试另一个地址族，避免顺序拨号额外等待。
async fn connect_server(target: &ServerTarget) -> std::io::Result<TcpStream> {
    if let Some(ip) = target.ip {
        return connect_address(SocketAddr::new(ip, target.port)).await;
    }
    let addresses: Vec<_> = lookup_host((target.host.as_str(), target.port))
        .await?
        .collect();
    let preferred_ipv6 = addresses
        .first()
        .ok_or(ErrorKind::AddrNotAvailable)?
        .is_ipv6();
    let (mut preferred, mut fallback): (VecDeque<_>, VecDeque<_>) = addresses
        .into_iter()
        .partition(|address| address.is_ipv6() == preferred_ipv6);
    let mut waiting = VecDeque::new();
    while !preferred.is_empty() || !fallback.is_empty() {
        if let Some(address) = preferred.pop_front() {
            waiting.push_back(address);
        }
        if let Some(address) = fallback.pop_front() {
            waiting.push_back(address);
        }
    }
    let mut attempts = JoinSet::new();
    attempts.spawn(connect_address(
        waiting.pop_front().expect("已确认存在解析地址"),
    ));
    let mut next_attempt = tokio::time::Instant::now() + ADDRESS_FALLBACK_DELAY;
    let mut last_error = Error::from(ErrorKind::AddrNotAvailable);
    while !attempts.is_empty() {
        tokio::select! {
            biased;
            Some(result) = attempts.join_next() => {
                match result {
                    Ok(Ok(stream)) => {
                        attempts.abort_all();
                        while attempts.join_next().await.is_some() {}
                        return Ok(stream);
                    }
                    Ok(Err(error)) => last_error = error,
                    Err(_) => last_error = Error::other("服务端拨号任务未正常结束"),
                }
                if let Some(address) = waiting.pop_front() {
                    attempts.spawn(connect_address(address));
                    next_attempt = tokio::time::Instant::now() + ADDRESS_FALLBACK_DELAY;
                }
            }
            _ = sleep_until(next_attempt),
                if !waiting.is_empty() && attempts.len() < MAX_CONCURRENT_DIALS => {
                attempts.spawn(connect_address(waiting.pop_front().expect("已确认存在候选地址")));
                next_attempt = tokio::time::Instant::now() + ADDRESS_FALLBACK_DELAY;
            }
        }
    }
    Err(last_error)
}

async fn establish_tunnel(
    mut client: TcpStream,
    target: &ServerTarget,
    username: &str,
    password: &str,
) -> std::io::Result<(TcpStream, TcpStream)> {
    client.set_nodelay(true)?;
    let mut greeting = [0; 2];
    client.read_exact(&mut greeting).await?;
    if greeting[0] != 5 {
        return Err(Error::from(ErrorKind::InvalidData));
    }
    let mut methods = vec![0; greeting[1] as usize];
    client.read_exact(&mut methods).await?;
    if !methods.contains(&2) {
        client.write_all(&[5, 255]).await?;
        return Err(Error::from(ErrorKind::PermissionDenied));
    }
    client.write_all(&[5, 2]).await?;
    let mut auth = [0; 2];
    client.read_exact(&mut auth).await?;
    if auth[0] != 1 || auth[1] == 0 {
        client.write_all(&[1, 1]).await?;
        return Err(Error::from(ErrorKind::PermissionDenied));
    }
    let mut requested_username = vec![0; auth[1] as usize];
    client.read_exact(&mut requested_username).await?;
    let password_length = client.read_u8().await?;
    let mut requested_password = vec![0; password_length as usize];
    client.read_exact(&mut requested_password).await?;
    if requested_username != username.as_bytes() || requested_password != password.as_bytes() {
        client.write_all(&[1, 1]).await?;
        return Err(Error::from(ErrorKind::PermissionDenied));
    }
    client.write_all(&[1, 0]).await?;
    let mut request = [0; 4];
    client.read_exact(&mut request).await?;
    if request[0] != 5 || request[2] != 0 {
        socks_reply(&mut client, 1).await?;
        return Err(Error::from(ErrorKind::InvalidData));
    }
    let host = match request[3] {
        1 => {
            let mut bytes = [0; 4];
            client.read_exact(&mut bytes).await?;
            RequestedHost::Ip(IpAddr::V4(Ipv4Addr::from(bytes)))
        }
        4 => {
            let mut bytes = [0; 16];
            client.read_exact(&mut bytes).await?;
            RequestedHost::Ip(IpAddr::V6(Ipv6Addr::from(bytes)))
        }
        3 => {
            let length = client.read_u8().await?;
            let mut bytes = vec![0; length as usize];
            client.read_exact(&mut bytes).await?;
            RequestedHost::Domain(
                String::from_utf8(bytes).map_err(|_| Error::from(ErrorKind::InvalidData))?,
            )
        }
        _ => {
            socks_reply(&mut client, 8).await?;
            return Err(Error::from(ErrorKind::InvalidData));
        }
    };
    let port = client.read_u16().await?;
    if request[1] != 1 {
        socks_reply(&mut client, 7).await?;
        return Err(Error::from(ErrorKind::PermissionDenied));
    }
    if !target.allows(&host, port) {
        socks_reply(&mut client, 2).await?;
        return Err(Error::from(ErrorKind::PermissionDenied));
    }
    // 始终拨号已验证的配置目标，不使用客户端提供的任意主机字符串。
    let server = match connect_server(target).await {
        Ok(server) => server,
        Err(error) => {
            socks_reply(&mut client, 5).await?;
            return Err(error);
        }
    };
    server.set_nodelay(true)?;
    socks_reply(&mut client, 0).await?;
    Ok((client, server))
}

/// 在每次成功写入时累加，握手字节不计入；EOF 仅半关闭对应方向。
async fn copy_counted<R, W>(
    mut reader: R,
    mut writer: W,
    counter: &AtomicU64,
) -> std::io::Result<()>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut buffer = [0; COPY_BUFFER_SIZE];
    loop {
        let read = reader.read(&mut buffer).await?;
        if read == 0 {
            writer.shutdown().await?;
            return Ok(());
        }
        let mut written = 0;
        while written < read {
            let bytes = writer.write(&buffer[written..read]).await?;
            if bytes == 0 {
                return Err(Error::from(ErrorKind::WriteZero));
            }
            counter.fetch_add(bytes as u64, Ordering::Relaxed);
            written += bytes;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, SocketAddr};
    use std::sync::Mutex;
    use std::time::Duration;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::{TcpListener, TcpStream};
    use tokio::time::{sleep, timeout};

    struct Endpoint {
        address: SocketAddr,
        username: String,
        password: String,
    }

    fn endpoint(monitor: &TrafficMonitor) -> Endpoint {
        let runtime: toml::Value = monitor.runtime_toml().unwrap().parse().unwrap();
        let url = runtime["transport"]["proxyURL"].as_str().unwrap();
        let (credentials, address) = url
            .strip_prefix("socks5://")
            .unwrap()
            .split_once('@')
            .unwrap();
        let (username, password) = credentials.split_once(':').unwrap();
        Endpoint {
            address: address.parse().unwrap(),
            username: username.to_string(),
            password: password.to_string(),
        }
    }

    async fn authenticate(endpoint: &Endpoint, password: &str) -> (TcpStream, [u8; 2]) {
        let mut stream = TcpStream::connect(endpoint.address).await.unwrap();
        stream.write_all(&[5, 2, 0, 2]).await.unwrap();
        let mut selection = [0; 2];
        timeout(Duration::from_secs(5), stream.read_exact(&mut selection))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(selection, [5, 2]);
        let mut auth = vec![1, endpoint.username.len() as u8];
        auth.extend_from_slice(endpoint.username.as_bytes());
        auth.push(password.len() as u8);
        auth.extend_from_slice(password.as_bytes());
        stream.write_all(&auth).await.unwrap();
        let mut result = [0; 2];
        timeout(Duration::from_secs(5), stream.read_exact(&mut result))
            .await
            .unwrap()
            .unwrap();
        (stream, result)
    }

    async fn request(stream: &mut TcpStream, host: &str, port: u16, command: u8) -> u8 {
        let mut request = vec![5, command, 0];
        match host.parse::<IpAddr>() {
            Ok(IpAddr::V4(address)) => {
                request.push(1);
                request.extend_from_slice(&address.octets());
            }
            Ok(IpAddr::V6(address)) => {
                request.push(4);
                request.extend_from_slice(&address.octets());
            }
            Err(_) => {
                request.extend_from_slice(&[3, host.len() as u8]);
                request.extend_from_slice(host.as_bytes());
            }
        };
        request.extend_from_slice(&port.to_be_bytes());
        stream.write_all(&request).await.unwrap();
        let mut response = [0; 10];
        timeout(Duration::from_secs(5), stream.read_exact(&mut response))
            .await
            .unwrap()
            .unwrap_or_else(|error| {
                panic!("读取 SOCKS 响应失败，命令={command}，目标={host}:{port}，错误={error}")
            });
        assert_eq!(response[0], 5);
        response[1]
    }

    async fn connect_through(monitor: &TrafficMonitor, host: &str, port: u16) -> TcpStream {
        let endpoint = endpoint(monitor);
        let (mut stream, auth) = authenticate(&endpoint, &endpoint.password).await;
        assert_eq!(auth, [1, 0]);
        assert_eq!(request(&mut stream, host, port, 1).await, 0);
        stream
    }

    fn config(port: u16) -> String {
        format!(
            "serverAddr = \"127.0.0.1\"\nserverPort = {port}\n\n[[proxies]]\nname = \"ssh\"\ntype = \"tcp\"\nlocalPort = 22\nremotePort = 6022\n"
        )
    }

    #[tokio::test]
    async fn supported_tcp_config_starts_authenticated_loopback_meter_without_changing_tls() {
        let upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let original = format!(
            "{}\n[transport]\nprotocol = \"tcp\"\ntcpMux = false\n[transport.tls]\nenable = true\nserverName = \"frps.example.test\"\ntrustedCaFile = \"./ca.crt\"\n",
            config(upstream.local_addr().unwrap().port())
        );
        let emitted = Arc::new(Mutex::new(Vec::new()));
        let captured = emitted.clone();
        let mut monitor = TrafficMonitor::start(
            "tcp_profile".to_string(),
            &original,
            Arc::new(move |sample| captured.lock().unwrap().push(sample.clone())),
        )
        .await;

        assert_eq!(monitor.snapshot().availability, "collecting");
        let runtime: toml::Value = monitor.runtime_toml().unwrap().parse().unwrap();
        let original: toml::Value = original.parse().unwrap();
        assert_eq!(runtime["serverAddr"], original["serverAddr"]);
        assert_eq!(runtime["serverPort"], original["serverPort"]);
        assert_eq!(runtime["transport"]["tls"], original["transport"]["tls"]);
        assert_eq!(
            runtime["transport"]["tcpMux"],
            original["transport"]["tcpMux"]
        );
        let proxy = runtime["transport"]["proxyURL"].as_str().unwrap();
        assert!(proxy.starts_with("socks5://"));
        assert!(proxy.contains("@127.0.0.1:"));
        assert_eq!(emitted.lock().unwrap().len(), 1);
        monitor.shutdown().await;
    }

    #[tokio::test]
    async fn authentication_is_mandatory_and_wrong_credentials_are_rejected() {
        let upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mut monitor = TrafficMonitor::start(
            "authentication".to_string(),
            &config(upstream.local_addr().unwrap().port()),
            Arc::new(|_| {}),
        )
        .await;
        let endpoint = endpoint(&monitor);
        let mut anonymous = TcpStream::connect(endpoint.address).await.unwrap();
        anonymous.write_all(&[5, 1, 0]).await.unwrap();
        let mut selection = [0; 2];
        timeout(Duration::from_secs(5), anonymous.read_exact(&mut selection))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(selection, [5, 255]);

        let (_, rejected) = authenticate(&endpoint, "incorrect-password").await;
        assert_eq!(rejected, [1, 1]);
        assert!(timeout(Duration::from_millis(100), upstream.accept())
            .await
            .is_err());
        monitor.shutdown().await;
    }

    #[tokio::test]
    async fn authenticated_client_cannot_connect_to_another_target_or_use_bind() {
        let upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = upstream.local_addr().unwrap().port();
        let mut monitor =
            TrafficMonitor::start("target".to_string(), &config(port), Arc::new(|_| {})).await;
        let endpoint = endpoint(&monitor);
        for (host, request_port, command, expected) in [
            ("127.0.0.2", port, 1, 2),
            ("127.0.0.1", port.saturating_sub(1), 1, 2),
            ("localhost", port, 1, 2),
            ("127.0.0.1", port, 2, 7),
            ("127.0.0.1", port, 3, 7),
        ] {
            let (mut stream, auth) = authenticate(&endpoint, &endpoint.password).await;
            assert_eq!(auth, [1, 0]);
            assert_eq!(
                request(&mut stream, host, request_port, command).await,
                expected
            );
        }
        assert!(timeout(Duration::from_millis(100), upstream.accept())
            .await
            .is_err());
        monitor.shutdown().await;
    }

    #[tokio::test]
    async fn long_lived_connection_counts_both_directions_once_before_close() {
        let upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = upstream.local_addr().unwrap().port();
        let samples = Arc::new(Mutex::new(Vec::new()));
        let captured = samples.clone();
        let mut monitor = TrafficMonitor::start(
            "long_lived".to_string(),
            &config(port),
            Arc::new(move |sample| captured.lock().unwrap().push(sample.clone())),
        )
        .await;
        let mut client = connect_through(&monitor, "127.0.0.1", port).await;
        let (mut server, _) = upstream.accept().await.unwrap();
        let upload = vec![17; 96_731];
        let download = vec![91; 48_359];

        let transfer = async {
            let outgoing = async {
                client.write_all(&upload).await.unwrap();
                let mut received = vec![0; download.len()];
                client.read_exact(&mut received).await.unwrap();
                assert_eq!(received, download);
            };
            let incoming = async {
                let mut received = vec![0; upload.len()];
                server.read_exact(&mut received).await.unwrap();
                assert_eq!(received, upload);
                server.write_all(&download).await.unwrap();
            };
            tokio::join!(outgoing, incoming);
        };
        timeout(Duration::from_secs(5), transfer).await.unwrap();
        sleep(Duration::from_millis(1_200)).await;
        let sample = monitor.snapshot();
        assert_eq!(sample.availability, "available");
        assert!(sample.upload_bytes_per_second > 0.0);
        assert!(sample.download_bytes_per_second > 0.0);
        assert_eq!(
            monitor.counters.upload.load(Ordering::Relaxed),
            upload.len() as u64
        );
        assert_eq!(
            monitor.counters.download.load(Ordering::Relaxed),
            download.len() as u64
        );
        assert!(samples
            .lock()
            .unwrap()
            .windows(2)
            .all(|pair| pair[0].sequence < pair[1].sequence));
        monitor.shutdown().await;
    }

    #[tokio::test]
    async fn half_closed_upload_still_receives_delayed_download() {
        let upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = upstream.local_addr().unwrap().port();
        let mut monitor =
            TrafficMonitor::start("half_close".to_string(), &config(port), Arc::new(|_| {})).await;
        let mut client = connect_through(&monitor, "127.0.0.1", port).await;
        let (mut server, _) = upstream.accept().await.unwrap();
        let transfer = async {
            let sender = async {
                client.write_all(b"request").await.unwrap();
                client.shutdown().await.unwrap();
                let mut response = Vec::new();
                client.read_to_end(&mut response).await.unwrap();
                assert_eq!(response, b"response after eof");
            };
            let receiver = async {
                let mut request = Vec::new();
                server.read_to_end(&mut request).await.unwrap();
                assert_eq!(request, b"request");
                server.write_all(b"response after eof").await.unwrap();
                server.shutdown().await.unwrap();
            };
            tokio::join!(sender, receiver);
        };
        timeout(Duration::from_secs(5), transfer).await.unwrap();
        assert_eq!(monitor.counters.upload.load(Ordering::Relaxed), 7);
        assert_eq!(monitor.counters.download.load(Ordering::Relaxed), 18);
        monitor.shutdown().await;
    }

    #[tokio::test]
    async fn shutdown_closes_listener_active_connections_and_sampling_tasks() {
        let upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = upstream.local_addr().unwrap().port();
        let emitted = Arc::new(Mutex::new(Vec::new()));
        let captured = emitted.clone();
        let mut monitor = TrafficMonitor::start(
            "shutdown".to_string(),
            &config(port),
            Arc::new(move |sample| captured.lock().unwrap().push(sample.clone())),
        )
        .await;
        let endpoint = endpoint(&monitor);
        let mut client = connect_through(&monitor, "127.0.0.1", port).await;
        let (mut server, _) = upstream.accept().await.unwrap();
        let mut handshake = TcpStream::connect(endpoint.address).await.unwrap();
        handshake.write_all(&[5]).await.unwrap();
        timeout(Duration::from_secs(2), monitor.shutdown())
            .await
            .unwrap();
        assert_eq!(monitor.snapshot().availability, "stopped");
        assert!(TcpStream::connect(endpoint.address).await.is_err());
        for stream in [&mut client, &mut server, &mut handshake] {
            let mut byte = [0];
            let closed = timeout(Duration::from_secs(2), stream.read(&mut byte))
                .await
                .unwrap();
            assert!(matches!(closed, Ok(0)) || closed.is_err());
        }
        let count = emitted.lock().unwrap().len();
        sleep(Duration::from_millis(1_100)).await;
        assert_eq!(emitted.lock().unwrap().len(), count);
        assert_eq!(
            emitted.lock().unwrap().last().unwrap().availability,
            "stopped"
        );
    }

    #[tokio::test]
    async fn disable_discards_runtime_proxy_and_reports_unavailable_in_same_run() {
        let upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mut monitor = TrafficMonitor::start(
            "fallback".to_string(),
            &config(upstream.local_addr().unwrap().port()),
            Arc::new(|_| {}),
        )
        .await;
        let endpoint = endpoint(&monitor);
        let before = monitor.snapshot();
        monitor
            .disable("无法保存临时运行配置，已保留原连接路径")
            .await;
        let after = monitor.snapshot();
        assert!(monitor.runtime_toml().is_none());
        assert_eq!(after.run_id, before.run_id);
        assert!(after.sequence > before.sequence);
        assert_eq!(after.availability, "unavailable");
        assert_eq!(
            after.reason.as_deref(),
            Some("无法保存临时运行配置，已保留原连接路径")
        );
        assert!(TcpStream::connect(endpoint.address).await.is_err());
        monitor.shutdown().await;
    }

    #[tokio::test]
    async fn dropping_monitor_aborts_listener_and_child_connections() {
        let upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = upstream.local_addr().unwrap().port();
        let monitor =
            TrafficMonitor::start("drop".to_string(), &config(port), Arc::new(|_| {})).await;
        let endpoint = endpoint(&monitor);
        let mut client = connect_through(&monitor, "127.0.0.1", port).await;
        let (mut server, _) = upstream.accept().await.unwrap();
        drop(monitor);
        for stream in [&mut client, &mut server] {
            let mut byte = [0];
            let closed = timeout(Duration::from_secs(2), stream.read(&mut byte))
                .await
                .unwrap();
            assert!(matches!(closed, Ok(0)) || closed.is_err());
        }
        assert!(TcpStream::connect(endpoint.address).await.is_err());
    }

    #[tokio::test]
    async fn unsupported_configuration_is_left_untouched_and_does_not_claim_zero_traffic() {
        for (label, addition) in [
            ("quic", "\n[transport]\nprotocol = \"quic\"\n"),
            ("kcp", "\n[transport]\nprotocol = \"kcp\"\n"),
            ("ws", "\n[transport]\nprotocol = \"websocket\"\n"),
            ("wss", "\n[transport]\nprotocol = \"wss\"\n"),
            (
                "proxy",
                "\n[transport]\nproxyURL = \"socks5://secret:token@localhost:1080\"\n",
            ),
            (
                "source",
                "\n[transport]\nconnectServerLocalIP = \"127.0.0.2\"\n",
            ),
        ] {
            let original = format!("{}{}", config(7000), addition);
            let mut monitor =
                TrafficMonitor::start(label.to_string(), &original, Arc::new(|_| {})).await;
            assert_eq!(monitor.snapshot().availability, "unavailable", "{label}");
            assert!(monitor.snapshot().reason.is_some(), "{label}");
            assert!(monitor.runtime_toml().is_none(), "{label}");
            assert!(!serde_json::to_string(&monitor.snapshot())
                .unwrap()
                .contains("secret:token"));
            monitor.shutdown().await;
        }
        for proxy_type in ["udp", "stcp", "sudp", "xtcp", "tcpmux", "unknown"] {
            let original =
                config(7000).replace("type = \"tcp\"", &format!("type = \"{proxy_type}\""));
            let mut monitor =
                TrafficMonitor::start(proxy_type.to_string(), &original, Arc::new(|_| {})).await;
            assert_eq!(
                monitor.snapshot().availability,
                "unavailable",
                "{proxy_type}"
            );
            assert!(monitor.runtime_toml().is_none());
            monitor.shutdown().await;
        }
        for original in [
            "serverAddr = \"{{ .Envs.FRP_SERVER }}\"\nserverPort = 7000",
            "serverAddr = \"localhost\"\nserverPort = 7000\nincludes = [\"./other.toml\"]",
            "serverAddr = \"localhost\"\nserverPort = 7000\ndnsServer = \"1.1.1.1\"",
            "serverAddr = \"localhost\"\nserverPort = 7000\n[[visitors]]\nname = \"visitor\"\ntype = \"stcp\"",
            "invalid TOML",
        ] {
            let mut monitor = TrafficMonitor::start("unsupported".to_string(), original, Arc::new(|_| {})).await;
            assert_eq!(monitor.snapshot().availability, "unavailable");
            assert!(monitor.runtime_toml().is_none());
            monitor.shutdown().await;
        }
    }

    #[tokio::test]
    async fn explicit_custom_dial_settings_keep_original_connection_path() {
        for key in [
            "dialServerTimeout",
            "dialServerKeepalive",
            "dialServerKeepAlive",
        ] {
            let original = format!("{}\n[transport]\n{key} = 30\n", config(7000));
            let mut monitor =
                TrafficMonitor::start("custom_dial".to_string(), &original, Arc::new(|_| {})).await;
            assert_eq!(monitor.snapshot().availability, "unavailable", "{key}");
            assert!(monitor.runtime_toml().is_none(), "{key}");
            assert!(monitor
                .snapshot()
                .reason
                .unwrap()
                .contains("自定义拨号设置"));
            monitor.shutdown().await;
        }
    }

    #[test]
    fn inherited_http_proxy_disables_metering_without_changing_process_environment() {
        assert!(prepare_config(&config(7000), true).is_err());
        assert!(prepare_config(&config(7000), false).is_ok());
    }

    #[test]
    fn rate_uses_actual_elapsed_time_and_resets_baseline_when_counters_drop() {
        let now = Instant::now();
        let mut baseline = RateBaseline::new(now, 100, 200);
        assert_eq!(
            baseline.sample(now + Duration::from_millis(2_500), 1100, 700),
            Some((400.0, 200.0))
        );
        assert_eq!(baseline.sample(now + Duration::from_secs(3), 10, 20), None);
        assert_eq!(
            baseline.sample(now + Duration::from_secs(5), 210, 420),
            Some((100.0, 200.0))
        );
        assert_eq!(
            baseline.sample(now + Duration::from_secs(5), 210, 420),
            None
        );
    }

    #[tokio::test]
    async fn separate_runs_have_distinct_credentials_and_strictly_newer_started_at() {
        let mut first =
            TrafficMonitor::start("restarted".to_string(), &config(7000), Arc::new(|_| {})).await;
        let mut second =
            TrafficMonitor::start("restarted".to_string(), &config(7000), Arc::new(|_| {})).await;
        assert_ne!(first.snapshot().run_id, second.snapshot().run_id);
        assert!(second.snapshot().started_at > first.snapshot().started_at);
        assert_ne!(endpoint(&first).username, endpoint(&second).username);
        assert_ne!(endpoint(&first).password, endpoint(&second).password);
        first.shutdown().await;
        second.shutdown().await;
    }

    #[test]
    fn domain_target_accepts_only_original_hostname_and_port() {
        let prepared = prepare_config(
            "serverAddr = \"frps.example.test\"\nserverPort = 7000",
            false,
        )
        .unwrap();
        assert!(prepared.target.allows(
            &RequestedHost::Domain("FRPS.EXAMPLE.TEST".to_string()),
            7000
        ));
        assert!(!prepared.target.allows(
            &RequestedHost::Domain("other.example.test".to_string()),
            7000
        ));
        assert!(!prepared.target.allows(
            &RequestedHost::Domain("frps.example.test".to_string()),
            7001
        ));
        assert!(!prepared
            .target
            .allows(&RequestedHost::Ip(IpAddr::V4(Ipv4Addr::LOCALHOST)), 7000));
    }

    #[test]
    fn mapped_ipv6_target_accepts_equivalent_ipv4_socks_address_only() {
        let prepared = prepare_config(
            "serverAddr = \"::ffff:127.0.0.1\"\nserverPort = 7000",
            false,
        )
        .unwrap();
        assert!(prepared
            .target
            .allows(&RequestedHost::Ip(IpAddr::V4(Ipv4Addr::LOCALHOST)), 7000));
        assert!(prepared.target.allows(
            &RequestedHost::Ip("::ffff:127.0.0.1".parse().unwrap()),
            7000,
        ));
        assert!(!prepared
            .target
            .allows(&RequestedHost::Ip("127.0.0.2".parse().unwrap()), 7000,));
        assert_eq!(prepared.target.host, "::ffff:127.0.0.1");
    }

    #[tokio::test]
    async fn hostname_dial_reaches_ipv4_without_waiting_for_unreachable_ipv6() {
        let upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = upstream.local_addr().unwrap().port();
        let original = config(port).replace("127.0.0.1", "localhost");
        let mut monitor =
            TrafficMonitor::start("dual_stack".to_string(), &original, Arc::new(|_| {})).await;
        let mut client = timeout(
            Duration::from_secs(1),
            connect_through(&monitor, "localhost", port),
        )
        .await
        .expect("IPv6 不可达时应及时尝试 IPv4");
        let (mut server, _) = upstream.accept().await.unwrap();
        client.write_all(b"dual stack").await.unwrap();
        let mut received = [0; 10];
        timeout(Duration::from_secs(1), server.read_exact(&mut received))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(&received, b"dual stack");
        monitor.shutdown().await;
    }

    #[tokio::test]
    async fn upstream_sockets_enable_system_tcp_keepalive_for_literal_and_hostname() {
        let upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = upstream.local_addr().unwrap().port();
        for host in ["127.0.0.1", "localhost", "::ffff:127.0.0.1"] {
            let target = ServerTarget {
                host: host.to_string(),
                port,
                ip: host.parse().ok(),
            };
            let connected = timeout(Duration::from_secs(2), connect_server(&target))
                .await
                .unwrap()
                .unwrap();
            let (_server, _) = upstream.accept().await.unwrap();
            let socket = tokio::net::TcpSocket::from_std_stream(connected.into_std().unwrap());
            assert!(socket.keepalive().unwrap(), "{host}");
        }
    }

    #[tokio::test]
    async fn backpressure_counts_each_completed_partial_write_before_eof() {
        let (mut source, reader) = tokio::io::duplex(1024);
        let (writer, mut destination) = tokio::io::duplex(17);
        let counter = Arc::new(AtomicU64::new(0));
        let observed = counter.clone();
        let transfer = tokio::spawn(async move { copy_counted(reader, writer, &observed).await });
        source.write_all(&[19; 256]).await.unwrap();
        sleep(Duration::from_millis(20)).await;
        assert_eq!(counter.load(Ordering::Relaxed), 17);
        let mut received = [0; 256];
        timeout(
            Duration::from_secs(2),
            destination.read_exact(&mut received),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(received, [19; 256]);
        source.shutdown().await.unwrap();
        timeout(Duration::from_secs(2), transfer)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(counter.load(Ordering::Relaxed), 256);
    }

    #[tokio::test]
    async fn sampling_sink_failure_marks_unavailable_and_keeps_active_transfer_open() {
        let upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = upstream.local_addr().unwrap().port();
        let mut monitor = TrafficMonitor::start(
            "sampling_failure".to_string(),
            &config(port),
            Arc::new(|sample| {
                if sample.availability == "available" {
                    panic!("模拟采样事件发布失败");
                }
            }),
        )
        .await;
        let mut client = connect_through(&monitor, "127.0.0.1", port).await;
        let (mut server, _) = upstream.accept().await.unwrap();
        sleep(Duration::from_millis(1_100)).await;
        assert_eq!(monitor.snapshot().availability, "unavailable");
        assert!(monitor.snapshot().reason.is_some());
        client.write_all(b"still connected").await.unwrap();
        let mut received = [0; 15];
        timeout(Duration::from_secs(2), server.read_exact(&mut received))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(&received, b"still connected");
        monitor.shutdown().await;
    }
}
