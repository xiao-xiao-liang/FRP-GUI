export type ProxyType = 'tcp' | 'udp' | 'http' | 'https' | 'stcp' | 'sudp' | 'xtcp' | 'tcpmux';

export interface ProxyRule {
  name: string;
  type: ProxyType;
  localIP: string;
  localPort: number;
  remotePort?: number;
  customDomains?: string[];
  subdomain?: string;
  secretKey?: string; // for stcp, xtcp, sudp
  allowUsers?: string[];
  useEncryption?: boolean;
  useCompression?: boolean;
  proxyProtocolVersion?: string;
  healthCheckType?: 'tcp' | 'http';
  healthCheckIntervalS?: number;
  healthCheckMaxFailed?: number;
  healthCheckTimeoutS?: number;
  healthCheckUrl?: string;
}

export interface VisitorRule {
  name: string;
  type: 'stcp' | 'sudp' | 'xtcp';
  serverName: string;
  secretKey?: string;
  bindAddr: string;
  bindPort: number;
  useEncryption?: boolean;
  useCompression?: boolean;
}

export interface FrpcConfig {
  serverAddr: string;
  serverPort: number;
  authMethod?: 'token' | 'oidc';
  authToken?: string;
  user?: string;
  metadatas?: Record<string, string>;
  transport?: {
    protocol?: 'tcp' | 'kcp' | 'quic' | 'websocket' | 'wss';
    dialServerTimeout?: number;
    dialServerKeepAlive?: number;
    connectServerLocalIP?: string;
    tls?: {
      enable?: boolean;
      certFile?: string;
      keyFile?: string;
      trustedCaFile?: string;
      serverName?: string;
    };
  };
  log?: {
    to?: string;
    level?: 'trace' | 'debug' | 'info' | 'warn' | 'error';
    maxDays?: number;
  };
  webServer?: {
    addr?: string;
    port?: number;
    user?: string;
    password?: string;
  };
  proxies: ProxyRule[];
  visitors: VisitorRule[];
}

export interface FrpsConfig {
  bindAddr?: string;
  bindPort: number;
  kcpBindPort?: number;
  quicBindPort?: number;
  vhostHTTPPort?: number;
  vhostHTTPSPort?: number;
  authMethod?: 'token' | 'oidc';
  authToken?: string;
  subDomainHost?: string;
  allowPorts?: string; // e.g. "1000-2000,3000,3001"
  webServer?: {
    addr?: string;
    port?: number;
    user?: string;
    password?: string;
  };
  log?: {
    to?: string;
    level?: 'trace' | 'debug' | 'info' | 'warn' | 'error';
    maxDays?: number;
  };
}

export type ProfileType = 'frpc' | 'frps';
export type ProcessStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export interface FrpcRuntimeStateEvent {
  profileId: string;
  status: ProcessStatus;
  pid?: number;
  timestamp: number;
  errorMessage?: string;
}

export interface FrpcRuntimeLogEvent {
  sequence: number;
  profileId: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

export type RuntimeTrafficAvailability = 'collecting' | 'available' | 'unavailable' | 'stopped';

/** 当前启动周期的独立流量样本，仅保存在运行期内存中。 */
export interface RuntimeTrafficSample {
  profileId: string;
  runId: string;
  startedAt: number;
  sequence: number;
  timestamp: number;
  availability: RuntimeTrafficAvailability;
  uploadBytesPerSecond: number;
  downloadBytesPerSecond: number;
  reason?: string | null;
}

export type FrpcFailureKind = 'core_invalid' | 'startup' | 'early_exit';

export interface ProcessCommandResult {
  accepted: boolean;
  pid?: number;
  error?: string;
  failureKind?: FrpcFailureKind;
  /** @deprecated Compatibility field for code expecting success until Task 3 */
  success?: boolean;
}

export interface ProfileStats {
  bytesIn: number;
  bytesOut: number;
  curConns: number;
  uptimeSeconds: number;
  pid?: number;
  startTime?: number;
  lastError?: string;
  lastFailureKind?: FrpcFailureKind;
  lastPingMs?: number;
  lastCheckedAt?: number;
  lastWarning?: string;
}

export interface Profile {
  id: string;
  name: string;
  type: ProfileType;
  description?: string;
  autoStart?: boolean;
  config: FrpcConfig | FrpsConfig;
  rawToml: string;
  status: ProcessStatus;
  stats: ProfileStats;
  coreId?: string;
  /** 已部署 FRPS 节点的本地标识；启动时由 Rust 从该节点凭据库注入 Token。 */
  serverNodeId?: string;
  groupId?: string;
  tags?: string[];
  isPinned?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ProfileSort = 'pinned_updated' | 'updated_desc' | 'name_asc';

export interface ProfileGroup {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'trace';

export interface LogEntry {
  id: string;
  sequence: number;
  profileId: string;
  profileName: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  raw: string;
}

export interface FrpCore {
  id: string;
  name: string;
  version: string;
  arch: string;
  os: string;
  path: string;
  isDefault: boolean;
  isCustom: boolean;
  status?: 'ready' | 'not_downloaded' | 'downloading';
  sizeBytes?: number;
  downloadUrl?: string;
  downloadDate?: string;
}

export type CoreDownloadPhase = 'downloading' | 'verifying' | 'extracting' | 'inspecting' | 'completed' | 'failed' | 'cancelled';

export interface CoreDownloadInstallation {
  path: string;
  version: string;
  os: string;
  arch: string;
  sizeBytes: number;
}

export interface CoreDownloadTask {
  taskId: string;
  releaseTag: string;
  assetName: string;
  phase: CoreDownloadPhase;
  targetOs: string;
  targetArch: string;
  targetDir: string;
  mirror: string;
  receivedBytes: number;
  totalBytes?: number;
  speedBytesPerSecond?: number;
  etaSeconds?: number;
  extractedEntries?: number;
  totalEntries?: number;
  currentFileName?: string;
  error?: string;
  installation?: CoreDownloadInstallation;
}

export interface PresetScenario {
  id: string;
  name: string;
  category: 'remote' | 'web' | 'game' | 'p2p' | 'custom';
  tag?: string;
  description: string;
  icon: string;
  defaultRule: Partial<ProxyRule>;
}

export interface DiagnosticResult {
  server: string;
  port: number;
  latencyMs: number | null;
  status: 'success' | 'failed' | 'testing';
  error?: string;
  timestamp: string;
}

export type ServerNodeAuthMethod = 'password' | 'private_key';
export type ServerNodeStatus = 'draft' | 'checking' | 'ready_to_deploy' | 'deploying' | 'running' | 'stopped' | 'error';

export type ServerPreflightOutcome = 'ready' | 'needs_host_trust' | 'needs_credentials' | 'failed';
export type ServerRemoteOs = 'ubuntu' | 'debian' | 'unsupported' | 'unknown';
export type ServerPrivilege = 'root' | 'sudo_passwordless' | 'sudo_password_required' | 'unavailable';

export interface ServerPreflightRequest {
  node: Pick<FrpServerNode, 'id' | 'host' | 'sshPort' | 'username' | 'authMethod' | 'credentialRef' | 'credentialsRemembered' | 'trustedHostKeyFingerprint'>;
  acceptedHostKeyFingerprint?: string;
  ephemeralCredentials?: ServerCredentialDraft;
}

export interface ServerPreflightResult {
  outcome: ServerPreflightOutcome;
  hostKeyFingerprint?: string;
  os?: ServerRemoteOs;
  architecture?: 'amd64' | 'arm64' | 'unsupported' | 'unknown';
  privilege?: ServerPrivilege;
  systemd?: boolean;
  requiresSudoPassword?: boolean;
  checkedAt: number;
  errorCode?: 'host_key_changed' | 'authentication_failed' | 'network_failed' | 'unsupported_os' | 'unsupported_architecture' | 'sudo_required' | 'systemd_unavailable' | 'credential_required' | 'command_failed' | 'unknown';
  errorMessage?: string;
}

export type FrpsServiceStatus = 'unknown' | 'running' | 'stopped' | 'failed';
export type ServerOperationKind = 'deploy' | 'start' | 'stop' | 'restart' | 'refresh_status' | 'read_logs';

export interface FrpsDeploymentDraft {
  version: string;
  bindPort: number;
  transportProtocol: 'tcp' | 'kcp' | 'quic';
  tlsForce: boolean;
  dashboardEnabled: boolean;
  dashboardPort?: number;
  dashboardUser?: string;
  authToken: string;
  dashboardPassword?: string;
}

export interface FrpsDeploymentSummary extends Omit<FrpsDeploymentDraft, 'authToken' | 'dashboardPassword'> {}

export interface FrpsDeploymentMetadata {
  summary: FrpsDeploymentSummary;
  serviceName: 'frp-gui-frps.service';
  installedAt: number;
  enabled: boolean;
}

export interface ServerOperationResult {
  operation: ServerOperationKind;
  outcome: 'completed' | 'failed' | 'needs_sudo_credentials';
  serviceStatus: FrpsServiceStatus;
  checkedAt: number;
  errorCode?: 'untrusted_host' | 'preflight_required' | 'sudo_required' | 'sudo_failed' | 'asset_checksum_failed' | 'config_invalid' | 'service_failed' | 'unknown';
  errorMessage?: string;
  deployment?: FrpsDeploymentMetadata;
  logs?: string[];
}

export interface FrpServerNode {
  id: string;
  name: string;
  host: string;
  sshPort: number;
  username: string;
  authMethod: ServerNodeAuthMethod;
  credentialRef?: string;
  credentialsRemembered: boolean;
  frpsBindPort: number;
  frpsDashboardPort?: number;
  installDir: string;
  frpsVersion?: string;
  status: ServerNodeStatus;
  isDefault: boolean;
  trustedHostKeyFingerprint?: string;
  remoteOs?: Exclude<ServerRemoteOs, 'unsupported' | 'unknown'>;
  remoteArchitecture?: 'amd64' | 'arm64';
  privilege?: ServerPrivilege;
  systemd?: boolean;
  requiresSudoPassword?: boolean;
  sudoCredentialsRemembered?: boolean;
  deployment?: FrpsDeploymentMetadata;
  serviceStatus?: FrpsServiceStatus;
  lastOperation?: Pick<ServerOperationResult, 'operation' | 'checkedAt' | 'errorCode'>;
  lastPreflight?: Pick<ServerPreflightResult, 'privilege' | 'systemd' | 'checkedAt'>;
  lastCheckedAt?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ServerCredentialDraft {
  password?: string;
  privateKey?: string;
  privateKeyPassphrase?: string;
}

export interface ServerNodeFormValues extends Omit<FrpServerNode, 'id' | 'credentialRef' | 'credentialsRemembered' | 'status' | 'isDefault' | 'trustedHostKeyFingerprint' | 'remoteOs' | 'remoteArchitecture' | 'requiresSudoPassword' | 'sudoCredentialsRemembered' | 'deployment' | 'serviceStatus' | 'lastOperation' | 'lastPreflight' | 'lastCheckedAt' | 'lastError' | 'createdAt' | 'updatedAt'> {
  rememberCredentials: boolean;
  credentials: ServerCredentialDraft;
}
