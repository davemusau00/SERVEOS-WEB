//! Windows SCM wrapper for the loopback HTTPS host.
//! The host owns printing; this process only starts it once and forwards stop.
use serde::Deserialize;
use std::{
    ffi::OsString,
    fs::{File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::mpsc::{self, RecvTimeoutError},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use url::Url;
use windows_service::{
    define_windows_service,
    service::{
        ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus,
        ServiceType,
    },
    service_control_handler::{self, ServiceControlHandlerResult},
    service_dispatcher,
};

const SERVICE_NAME: &str = "ServOSPrintBridge";
const STOP_MESSAGE: &[u8] = b"SERVOS_PRINT_BRIDGE_SHUTDOWN\n";
const STOP_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LaunchConfiguration {
    node_executable: PathBuf,
    host_script: PathBuf,
    worker_executable: PathBuf,
    approved_configuration: PathBuf,
    journal_path: PathBuf,
    tls_private_key: PathBuf,
    tls_certificate: PathBuf,
    https_origin: String,
}

fn read_configuration(path: &Path) -> Result<LaunchConfiguration, String> {
    if !path.is_absolute() {
        return Err("Service configuration path must be absolute".into());
    }
    let file = File::open(path).map_err(|_| "Cannot read Print Bridge service configuration")?;
    let mut bytes = Vec::new();
    file.take(32 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Cannot read Print Bridge service configuration")?;
    if bytes.len() > 32 * 1024 {
        return Err("Print Bridge service configuration exceeds 32 KiB".into());
    }
    let config: LaunchConfiguration =
        serde_json::from_slice(&bytes).map_err(|_| "Invalid Print Bridge service configuration")?;
    let paths = [
        &config.node_executable,
        &config.host_script,
        &config.worker_executable,
        &config.approved_configuration,
        &config.journal_path,
        &config.tls_private_key,
        &config.tls_certificate,
    ];
    let journal_parent_exists = config
        .journal_path
        .parent()
        .map(Path::is_dir)
        .unwrap_or(false);
    let valid_origin = Url::parse(&config.https_origin)
        .map(|origin| {
            origin.scheme() == "https"
                && origin.origin().ascii_serialization() == config.https_origin
                && matches!(origin.host_str(), Some("localhost" | "127.0.0.1"))
                && origin
                    .port_or_known_default()
                    .is_some_and(|port| port >= 1024)
        })
        .unwrap_or(false);
    if paths.iter().any(|path| !path.is_absolute())
        || paths[..4].iter().any(|path| !path.is_file())
        || !paths[5].is_file()
        || !paths[6].is_file()
        || !journal_parent_exists
        || config.https_origin.len() > 256
        || !valid_origin
    {
        return Err("Print Bridge service paths or localhost HTTPS origin are invalid".into());
    }
    Ok(config)
}

fn host_command(config: &LaunchConfiguration) -> Command {
    let mut command = Command::new(&config.node_executable);
    command
        .arg(&config.host_script)
        .current_dir(config.host_script.parent().unwrap_or(Path::new(".")))
        .env("PRINT_BRIDGE_HTTPS_ORIGIN", &config.https_origin)
        .env("PRINT_BRIDGE_WORKER", &config.worker_executable)
        .env("PRINT_BRIDGE_CONFIG", &config.approved_configuration)
        .env("PRINT_BRIDGE_JOURNAL", &config.journal_path)
        .env("PRINT_BRIDGE_TLS_KEY", &config.tls_private_key)
        .env("PRINT_BRIDGE_TLS_CERT", &config.tls_certificate)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command
}

fn request_host_shutdown(child: &mut Child) {
    if let Some(mut input) = child.stdin.take() {
        let _ = input.write_all(STOP_MESSAGE);
        let _ = input.flush();
    }
}

fn event(configuration_path: Option<&Path>, code: &str) {
    let Some(configuration_path) = configuration_path else {
        return;
    };
    let Ok(now) = SystemTime::now().duration_since(UNIX_EPOCH) else {
        return;
    };
    let path = configuration_path.with_file_name("service-events.log");
    let Ok(file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    if file
        .metadata()
        .map(|metadata| metadata.len() < 1024 * 1024)
        .unwrap_or(false)
    {
        let mut file = file;
        let _ = writeln!(file, "{} {}", now.as_secs(), code);
    }
}

fn stop_child(child: &mut Child) -> Result<bool, String> {
    request_host_shutdown(child);
    let deadline = Instant::now() + STOP_TIMEOUT;
    loop {
        if let Some(status) = child.try_wait().map_err(|_| "Cannot inspect bridge host")? {
            return Ok(status.success());
        }
        if Instant::now() >= deadline {
            // An interrupted print is recovered as DELIVERY_UNCERTAIN on next startup.
            let _ = child.kill();
            let _ = child.wait();
            return Ok(false);
        }
        thread::sleep(Duration::from_millis(200));
    }
}

define_windows_service!(ffi_service_main, service_main);

fn service_main(arguments: Vec<OsString>) {
    // SCM supplies the service name followed by the absolute config path.
    let configuration_path = if arguments.is_empty() || arguments.len() > 2 {
        None
    } else {
        arguments.last().map(PathBuf::from)
    };
    let log_path = configuration_path.as_deref();
    event(log_path, "SERVICE_STARTING");
    let _ = run_service(configuration_path, log_path);
}

fn run_service(configuration_path: Option<PathBuf>, log_path: Option<&Path>) -> Result<(), String> {
    let (stop_sender, stop_receiver) = mpsc::channel::<()>();
    let event_handler = move |event| match event {
        ServiceControl::Stop | ServiceControl::Shutdown => {
            let _ = stop_sender.send(());
            ServiceControlHandlerResult::NoError
        }
        ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
        _ => ServiceControlHandlerResult::NotImplemented,
    };
    let status_handle = service_control_handler::register(SERVICE_NAME, event_handler)
        .map_err(|_| "Cannot register Print Bridge service control handler")?;

    let configuration_path = match configuration_path {
        Some(path) => path,
        None => {
            status_handle
                .set_service_status(ServiceStatus {
                    service_type: ServiceType::OWN_PROCESS,
                    current_state: ServiceState::Stopped,
                    controls_accepted: ServiceControlAccept::empty(),
                    exit_code: ServiceExitCode::Win32(1),
                    checkpoint: 0,
                    wait_hint: Duration::default(),
                    process_id: None,
                })
                .map_err(|_| "Cannot report missing service configuration")?;
            event(log_path, "CONFIG_ARGUMENT_INVALID");
            return Err("Print Bridge service configuration path is missing".into());
        }
    };
    let configuration = match read_configuration(&configuration_path) {
        Ok(configuration) => configuration,
        Err(_) => {
            status_handle
                .set_service_status(ServiceStatus {
                    service_type: ServiceType::OWN_PROCESS,
                    current_state: ServiceState::Stopped,
                    controls_accepted: ServiceControlAccept::empty(),
                    exit_code: ServiceExitCode::Win32(1),
                    checkpoint: 0,
                    wait_hint: Duration::default(),
                    process_id: None,
                })
                .map_err(|_| "Cannot report Print Bridge configuration failure")?;
            event(log_path, "CONFIGURATION_INVALID");
            return Err("Invalid Print Bridge service configuration".into());
        }
    };

    let mut child = match host_command(&configuration).spawn() {
        Ok(child) => child,
        Err(_) => {
            status_handle
                .set_service_status(ServiceStatus {
                    service_type: ServiceType::OWN_PROCESS,
                    current_state: ServiceState::Stopped,
                    controls_accepted: ServiceControlAccept::empty(),
                    exit_code: ServiceExitCode::Win32(1),
                    checkpoint: 0,
                    wait_hint: Duration::default(),
                    process_id: None,
                })
                .map_err(|_| "Cannot report Print Bridge startup failure")?;
            event(log_path, "HOST_START_FAILED");
            return Err("Cannot start the local HTTPS host".into());
        }
    };

    if status_handle
        .set_service_status(ServiceStatus {
            service_type: ServiceType::OWN_PROCESS,
            current_state: ServiceState::Running,
            controls_accepted: ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: Duration::default(),
            process_id: None,
        })
        .is_err()
    {
        let _ = stop_child(&mut child);
        return Err("Cannot report Print Bridge service running".into());
    }
    event(log_path, "SERVICE_RUNNING");

    let exit_code = loop {
        match stop_receiver.recv_timeout(Duration::from_millis(500)) {
            Ok(()) | Err(RecvTimeoutError::Disconnected) => {
                let _ = status_handle.set_service_status(ServiceStatus {
                    service_type: ServiceType::OWN_PROCESS,
                    current_state: ServiceState::StopPending,
                    controls_accepted: ServiceControlAccept::empty(),
                    exit_code: ServiceExitCode::Win32(0),
                    checkpoint: 1,
                    wait_hint: STOP_TIMEOUT + Duration::from_secs(5),
                    process_id: None,
                });
                event(log_path, "STOP_REQUESTED");
                let result = match stop_child(&mut child) {
                    Ok(result) => result,
                    Err(_) => {
                        let _ = child.kill();
                        let _ = child.wait();
                        false
                    }
                };
                event(
                    log_path,
                    if result {
                        "HOST_STOPPED"
                    } else {
                        "HOST_STOP_UNCERTAIN"
                    },
                );
                break if result { 0 } else { 1 };
            }
            Err(RecvTimeoutError::Timeout) => {
                let status = match child.try_wait() {
                    Ok(status) => status,
                    Err(_) => {
                        let _ = child.kill();
                        let _ = child.wait();
                        break 1;
                    }
                };
                if let Some(status) = status {
                    event(log_path, "HOST_EXITED");
                    break if status.success() { 0 } else { 1 };
                }
            }
        }
    };

    status_handle
        .set_service_status(ServiceStatus {
            service_type: ServiceType::OWN_PROCESS,
            current_state: ServiceState::Stopped,
            controls_accepted: ServiceControlAccept::empty(),
            exit_code: ServiceExitCode::Win32(exit_code),
            checkpoint: 0,
            wait_hint: Duration::default(),
            process_id: None,
        })
        .map_err(|_| "Cannot report Print Bridge service stopped")?;
    if exit_code == 0 {
        Ok(())
    } else {
        Err("Print Bridge host stopped unexpectedly or required forced termination".into())
    }
}

fn main() -> windows_service::Result<()> {
    service_dispatcher::start(SERVICE_NAME, ffi_service_main)
}
