//! 使用官方 FRP 核心验证真实连接、持续采样和运行时清理。
//! 运行前通过 FRP_TRAFFIC_TEST_CORE_DIR 指定同时包含 frpc、frps 的目录。

use frp_gui_lib::frpc_runtime::FrpcRuntimeManager;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::{Pid, System};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::task::{JoinHandle, JoinSet};

type TestResult<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;

struct TestDirectory(PathBuf);

impl TestDirectory {
    fn new() -> TestResult<Self> {
        let path =
            std::env::temp_dir().join(format!("frp-gui-traffic-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&path)?;
        Ok(Self(path))
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        if let Err(error) = std::fs::remove_dir_all(&self.0) {
            eprintln!("清理官方核心测试目录失败：{error}");
        }
    }
}

struct OwnedChild(Child);

impl Drop for OwnedChild {
    fn drop(&mut self) {
        // 仅回收本测试创建的子进程，确保断言失败时同样释放监听端口。
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

struct RuntimeProcessGuard {
    pid: Option<u32>,
    executable: PathBuf,
}

impl Drop for RuntimeProcessGuard {
    fn drop(&mut self) {
        if let Some(pid) = self.pid {
            let mut system = System::new();
            let pid = Pid::from_u32(pid);
            system.refresh_process(pid);
            if let Some(process) = system.process(pid) {
                // 异常退出的兜底只针对本次复制的核心，避免误杀复用 PID 的进程。
                if process.exe().and_then(|path| path.canonicalize().ok())
                    == self.executable.canonicalize().ok()
                {
                    process.kill();
                    for _ in 0..100 {
                        if !system.refresh_process(pid) {
                            break;
                        }
                        std::thread::sleep(Duration::from_millis(20));
                    }
                }
            }
        }
    }
}

struct EchoServer {
    port: u16,
    task: JoinHandle<()>,
    accepted: Arc<AtomicUsize>,
}

#[derive(Default)]
struct TransferProgress {
    sent: AtomicUsize,
    received: AtomicUsize,
}

impl EchoServer {
    async fn start() -> TestResult<Self> {
        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let port = listener.local_addr()?.port();
        let accepted_connections = Arc::new(AtomicUsize::new(0));
        let accepted_counter = accepted_connections.clone();
        let task = tokio::spawn(async move {
            let mut connections = JoinSet::new();
            loop {
                tokio::select! {
                    accepted = listener.accept() => {
                        let Ok((stream, _)) = accepted else { break; };
                        accepted_counter.fetch_add(1, Ordering::Relaxed);
                        connections.spawn(async move {
                            let (mut reader, mut writer) = stream.into_split();
                            // 测试客户端结束或进程清理时允许连接正常断开。
                            let _ = tokio::io::copy(&mut reader, &mut writer).await;
                        });
                    }
                    _ = connections.join_next(), if !connections.is_empty() => {}
                }
            }
        });
        Ok(Self {
            port,
            task,
            accepted: accepted_connections,
        })
    }
}

impl Drop for EchoServer {
    fn drop(&mut self) {
        // JoinSet 随监听任务一起释放，回收尚未结束的回显连接。
        self.task.abort();
    }
}

fn executable(directory: &Path, name: &str) -> PathBuf {
    directory.join(format!("{name}{}", std::env::consts::EXE_SUFFIX))
}

fn spawn_core(executable: &Path, config: &Path, directory: &Path) -> TestResult<OwnedChild> {
    let mut command = Command::new(executable);
    command.arg("-c").arg(config).current_dir(directory);
    let log_path = config.with_extension("log");
    let log_file = std::fs::File::create(log_path)?;
    command
        .stdin(Stdio::null())
        .stderr(log_file.try_clone()?)
        .stdout(log_file);
    command.env_remove("http_proxy").env_remove("HTTP_PROXY");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    Ok(OwnedChild(command.spawn()?))
}

async fn connect_when_ready(port: u16) -> TestResult<TcpStream> {
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        match TcpStream::connect(("127.0.0.1", port)).await {
            Ok(stream) => return Ok(stream),
            Err(error) if Instant::now() >= deadline => return Err(error.into()),
            Err(_) => tokio::time::sleep(Duration::from_millis(25)).await,
        }
    }
}

async fn transfer(
    stream: TcpStream,
    chunks: usize,
    pause: Duration,
    progress: Option<Arc<TransferProgress>>,
) -> TestResult<(usize, Duration)> {
    let started = Instant::now();
    let (mut reader, mut writer) = stream.into_split();
    let payload = vec![0x5a; 64 * 1024];
    let expected_bytes = payload.len() * chunks;
    let receive = async {
        let mut remaining = expected_bytes;
        let mut digest = Sha256::new();
        let mut buffer = vec![0; 64 * 1024];
        while remaining > 0 {
            let capacity = remaining.min(buffer.len());
            let size = reader.read(&mut buffer[..capacity]).await?;
            if size == 0 {
                return Err(format!(
                    "官方核心转发数据提前结束：期望 {expected_bytes} 字节，实际 {} 字节",
                    expected_bytes - remaining
                )
                .into());
            }
            remaining -= size;
            digest.update(&buffer[..size]);
            if let Some(progress) = &progress {
                progress.received.fetch_add(size, Ordering::Relaxed);
            }
        }
        Ok::<_, Box<dyn std::error::Error + Send + Sync>>(digest.finalize())
    };
    let send = async {
        let mut digest = Sha256::new();
        for _ in 0..chunks {
            writer.write_all(&payload).await?;
            if let Some(progress) = &progress {
                progress.sent.fetch_add(payload.len(), Ordering::Relaxed);
            }
            digest.update(&payload);
            if !pause.is_zero() {
                tokio::time::sleep(pause).await;
            }
        }
        Ok::<_, Box<dyn std::error::Error + Send + Sync>>(digest.finalize())
    };
    let (received_digest, sent_digest) = tokio::try_join!(receive, send)?;
    if received_digest != sent_digest {
        return Err("官方核心转发数据摘要不一致".into());
    }
    // 官方 FRP 在一侧 EOF 时会关闭整条业务连接，完整接收回显后再结束发送端。
    writer.shutdown().await?;
    Ok((expected_bytes, started.elapsed()))
}

struct CaseReport {
    burst_bytes: usize,
    burst_elapsed: Duration,
    upload_bytes_per_second: f64,
    download_bytes_per_second: f64,
}

async fn run_case(
    core_directory: &Path,
    tls: bool,
    tcp_mux: bool,
    metered: bool,
) -> TestResult<CaseReport> {
    let directory = TestDirectory::new()?;
    let local = EchoServer::start().await?;
    // FRPS 无法继承外部预绑定的套接字，启动前短暂释放两个随机端口。
    let server_reservation = TcpListener::bind("127.0.0.1:0").await?;
    let proxy_reservation = TcpListener::bind("127.0.0.1:0").await?;
    let server_port = server_reservation.local_addr()?.port();
    let proxy_port = proxy_reservation.local_addr()?.port();
    let token = uuid::Uuid::new_v4().to_string();
    let server_config = directory.0.join("frps.toml");
    std::fs::write(&server_config, format!(
        "bindAddr = \"127.0.0.1\"\nproxyBindAddr = \"127.0.0.1\"\nbindPort = {server_port}\nauth.token = \"{token}\"\nlog.level = \"error\"\ntransport.tcpMux = {tcp_mux}\n"
    ))?;
    let client_config = format!(
        "serverAddr = \"localhost\"\nserverPort = {server_port}\nauth.token = \"{token}\"\nlog.level = \"error\"\ntransport.protocol = \"tcp\"\ntransport.tcpMux = {tcp_mux}\ntransport.tls.enable = {tls}\n[[proxies]]\nname = \"traffic-test\"\ntype = \"tcp\"\nlocalIP = \"127.0.0.1\"\nlocalPort = {}\nremotePort = {proxy_port}\n", local.port
    );
    drop(server_reservation);
    drop(proxy_reservation);
    let _server = spawn_core(
        &executable(core_directory, "frps"),
        &server_config,
        &directory.0,
    )?;
    drop(connect_when_ready(server_port).await?);
    let client_path = executable(&directory.0, "frpc");
    std::fs::copy(executable(core_directory, "frpc"), &client_path)?;
    let manager = Arc::new(FrpcRuntimeManager::new(directory.0.join("runtime")));
    let mut runtime_guard = RuntimeProcessGuard {
        pid: None,
        executable: client_path.clone(),
    };
    let mut direct_child = None;
    let result = async {
        if metered {
            let result = manager
                .start_profile(
                    None,
                    "traffic_test".to_string(),
                    client_config.clone(),
                    client_path.to_string_lossy().to_string(),
                )
                .await;
            runtime_guard.pid = result.pid;
            if !result.accepted {
                return Err(format!("运行时启动官方核心失败：{:?}", result.error).into());
            }
        } else {
            let config_path = directory.0.join("direct.toml");
            std::fs::write(&config_path, &client_config)?;
            direct_child = Some(spawn_core(&client_path, &config_path, &directory.0)?);
        }
        let stream = connect_when_ready(proxy_port).await?;
        let progress = Arc::new(TransferProgress::default());
        let ongoing = transfer(
            stream,
            220,
            Duration::from_millis(10),
            Some(progress.clone()),
        );
        tokio::pin!(ongoing);
        let inspect_sample = async {
            if !metered {
                tokio::time::sleep(Duration::from_millis(1400)).await;
                return Ok::<_, Box<dyn std::error::Error + Send + Sync>>(None);
            }
            // 从业务数据实际开始往返后等待完整采样周期，排除拨号与注册耗时。
            while progress.received.load(Ordering::Relaxed) == 0 {
                tokio::time::sleep(Duration::from_millis(25)).await;
            }
            tokio::time::sleep(Duration::from_millis(1100)).await;
            let samples = manager.get_runtime_traffic().await;
            let sample = samples
                .iter()
                .find(|sample| sample.profile_id == "traffic_test")
                .ok_or("运行时没有返回流量样本")?;
            if sample.availability != "available"
                || sample.sequence == 0
                || sample.upload_bytes_per_second < 64.0 * 1024.0
                || sample.download_bytes_per_second < 64.0 * 1024.0
            {
                eprintln!(
                    "官方测试回显端已接受连接={}，控制端口={}，公开端口={}",
                    local.accepted.load(Ordering::Relaxed),
                    server_port,
                    proxy_port
                );
                eprintln!(
                    "官方测试服务端诊断：{}",
                    std::fs::read_to_string(directory.0.join("frps.log"))?
                );
                for entry in manager
                    .get_runtime_logs(Some("traffic_test".to_string()))
                    .await?
                {
                    eprintln!("官方测试核心诊断：{}", entry.message);
                }
                return Err(format!("传输中没有可用的双向流量样本：状态={}，序号={}，上传={}，下载={}，已写入业务数据={}字节，已接收业务数据={}字节", sample.availability, sample.sequence, sample.upload_bytes_per_second, sample.download_bytes_per_second, progress.sent.load(Ordering::Relaxed), progress.received.load(Ordering::Relaxed)).into());
            }
            Ok(Some(sample.clone()))
        };
        let first_sample = tokio::select! {
            result = &mut ongoing => {
                result?;
                return Err("持续传输在采样检查前意外结束".into());
            }
            sample = inspect_sample => sample?,
        };
        ongoing.await?;
        let mut upload = 0.0;
        let mut download = 0.0;
        if let Some(first) = first_sample {
            upload = first.upload_bytes_per_second;
            download = first.download_bytes_per_second;
            let samples = manager.get_runtime_traffic().await;
            let latest = samples
                .iter()
                .find(|sample| sample.profile_id == "traffic_test")
                .ok_or("持续传输结束后缺少流量样本")?;
            if latest.run_id != first.run_id
                || latest.sequence <= first.sequence
                || latest.timestamp <= first.timestamp
            {
                return Err("同一次运行没有持续递增的流量样本".into());
            }
        }
        let (burst_bytes, burst_elapsed) = transfer(
            connect_when_ready(proxy_port).await?,
            256,
            Duration::ZERO,
            None,
        )
        .await?;
        Ok::<_, Box<dyn std::error::Error + Send + Sync>>(CaseReport {
            burst_bytes,
            burst_elapsed,
            upload_bytes_per_second: upload,
            download_bytes_per_second: download,
        })
    };
    let result = tokio::time::timeout(Duration::from_secs(30), result).await;
    // 在向测试框架传播任何错误之前先确认停止，避免失败路径留下 FRPC。
    if metered {
        if tls && tcp_mux && matches!(&result, Ok(Ok(_))) {
            // 最后一组绕过 stop 命令，验证核心真实意外退出也会清理计量资源。
            let pid = Pid::from_u32(runtime_guard.pid.ok_or("运行时缺少核心 PID")?);
            let mut system = System::new();
            system.refresh_process(pid);
            if !system.process(pid).is_some_and(|process| process.kill()) {
                return Err("无法终止测试创建的官方核心".into());
            }
            tokio::time::timeout(Duration::from_secs(5), async {
                loop {
                    let states = manager.get_runtime_states().await;
                    if states.iter().any(|state| {
                        state.profile_id == "traffic_test"
                            && state.status == "error"
                            && state.pid.is_none()
                    }) {
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(25)).await;
                }
            })
            .await?;
            runtime_guard.pid = None;
        } else {
            let stopped = manager.stop_profile(None, "traffic_test".to_string()).await;
            if stopped.accepted {
                runtime_guard.pid = None;
            } else if runtime_guard.pid.is_some() {
                return Err(format!("运行时停止官方核心失败：{:?}", stopped.error).into());
            }
        }
        if manager
            .get_runtime_traffic()
            .await
            .iter()
            .any(|sample| sample.availability != "stopped")
        {
            return Err("停止后仍返回活动流量样本".into());
        }
        let runtime_config_directory = directory.0.join("runtime").join("runtime-config");
        if runtime_config_directory.exists() {
            let entries = std::fs::read_dir(&runtime_config_directory)?;
            for entry in entries {
                let name = entry?.file_name();
                let name = name.to_string_lossy();
                if name.starts_with("traffic_") && name != "traffic_test.toml" {
                    return Err("停止后残留临时计量配置".into());
                }
            }
            for path in [
                directory.0.join("frpc.toml"),
                directory.0.join("frpc_traffic_test.toml"),
                runtime_config_directory.join("traffic_test.toml"),
            ] {
                if std::fs::read_to_string(path)? != client_config {
                    return Err("临时计量参数污染了原始配置".into());
                }
            }
        }
    }
    drop(direct_child);
    result?
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "需要 FRP_TRAFFIC_TEST_CORE_DIR 中的官方 frpc/frps 核心"]
async fn official_frp_tcp_tls_mux_traffic_and_runtime_cleanup() -> TestResult<()> {
    let core_directory = PathBuf::from(std::env::var("FRP_TRAFFIC_TEST_CORE_DIR")?);
    for name in ["frpc", "frps"] {
        if !executable(&core_directory, name).is_file() {
            return Err(format!("核心目录缺少 {name}").into());
        }
    }
    for tls in [false, true] {
        for tcp_mux in [false, true] {
            eprintln!("验证官方核心直连：TLS={tls}，tcpMux={tcp_mux}");
            let direct = run_case(&core_directory, tls, tcp_mux, false).await?;
            eprintln!("验证官方核心计量：TLS={tls}，tcpMux={tcp_mux}");
            let metered = run_case(&core_directory, tls, tcp_mux, true).await?;
            let mib = direct.burst_bytes as f64 / (1024.0 * 1024.0);
            eprintln!(
                "官方核心 TCP：TLS={tls}，tcpMux={tcp_mux}，每方向数据={mib:.0} MiB，直连={:.3}s（{:.1} MiB/s），计量={:.3}s（{:.1} MiB/s），传输中上传={:.0} B/s，下载={:.0} B/s",
                direct.burst_elapsed.as_secs_f64(), mib / direct.burst_elapsed.as_secs_f64(),
                metered.burst_elapsed.as_secs_f64(), metered.burst_bytes as f64 / (1024.0 * 1024.0) / metered.burst_elapsed.as_secs_f64(),
                metered.upload_bytes_per_second, metered.download_bytes_per_second,
            );
        }
    }
    Ok(())
}
