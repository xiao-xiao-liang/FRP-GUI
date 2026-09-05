# FRP-GUI P1-B「场景化新建连接向导」Implementation Plan (终版修订)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打造面向普通用户的场景化“新建连接”向导，让用户先选用途（远程桌面、SSH、公开网站、家庭 NAS、游戏联机、自定义），再填写极简必要字段，通过统一的“检查并保存”校验核心、地址、端口与真实网络连通性探测分支（含探测失败独立重试与仍然保存用例），保存后直接关闭弹窗回到“我的连接”工作台；高级设置仅展示只读 TOML 预览并提供“转为高级编辑”完整草稿接管契约；Web 场景全面统一为“本地端口 + 自定义域名”，移除远程端口歧义。

**Architecture:**
1. **单一权威场景模型 (`src/services/presets.ts`)**：
   - 保持既有 `PRESET_SCENARIOS`（8 个既有预设供高级模式复用）；
   - 新增并导出 `WIZARD_SCENARIOS`（6 大用途）与 `ScenarioVariant`（NAS / 游戏变体），作为向导唯一的元数据来源；
   - 代码级明确每一个场景与变体的 `defaultName`、`defaultProxyName`、`defaultType`、`defaultLocalPort`、`defaultRemotePort`；
   - **Web 场景规范化**：`defaultRemotePort: undefined`，向导界面仅展示“本地端口”与“自定义域名”，无远程端口输入与文案。
2. **场景向导与极简表单 (`src/features/editor/ScenarioWizard.tsx` & `ConfigEditorModal.tsx`)**：
   - **新建模式 (`editingProfile === null`)**：默认挂载向导；
   - **两步走流程**：
     - **步骤一：选择用途**：6 个场景卡片；点击“自定义连接”直接调用 `onSwitchToAdvanced(draft)` 转入完整编辑器；
     - **步骤二：填写必要信息**：按场景渲染极简字段与变体选择（群晖/Alist/Jellyfin、MC Java/基岩/泰拉瑞亚/自定义游戏）；
   - **高级设置抽屉与草稿接管契约**：
     - 只读展示根据当前表单动态生成的 TOML 源码；
     - 提供【转为高级编辑模式】按钮，调用 `onSwitchToAdvanced(draft: ScenarioFormValues)`，Modal 将草稿中的名称、服务器、端口、Token、协议、TLS 及代理规则完整写入完整表单状态并生成同步 TOML；
   - **编辑模式 (`editingProfile !== null`)**：弹窗标题统一为 `编辑连接: [连接名称]`，直接进入完整表单/TOML 编辑器。
3. **“检查并保存”与连通性流转校验器 (`src/services/profile-validator.ts`)**：
   - 本地规则校验：必填项、端口区间（1-65535）、Web 场景自定义域名校验（不校验远程端口）；
   - 核心状态感知：未配置核心时进入 `warnings`（不阻断 `valid=true`）；
   - 连通性探测分支：
     - 探测成功 ➔ 直接执行保存并提示成功；
     - 探测失败 ➔ 展示探测失败原因与耗时，提供【重试检测】与【仍然保存】（人工显式确认，绝不自动保存）；
     - 独立测试：分别覆盖探测成功保存、探测失败后重试成功保存、探测失败后直接点击【仍然保存】；
   - Token 安全保护：密码框默认掩码并支持眼睛图标显隐，严禁在 Toast、日志与错误信息中输出明文 Token；
   - 构造器 `buildScenarioProfile` 生成标准 `Profile`（含合规 `FrpcConfig` 与合法 `rawToml`）。
4. **弹窗关闭与 App 契约 (`src/App.tsx` & `ConfigEditorModal.tsx`)**：
   - 仅保留必填 `activeCore: FrpCore | null`；
   - 保存成功时由 `ConfigEditorModal` 统一调用 `onSave(profile)` 与 `onClose()` 关闭弹窗，`App.tsx` 负责状态更新与 Toast 提醒。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、Radix UI (`@radix-ui/react-dialog`)、Lucide Icons、Vitest、React Testing Library。

---

## 范围与文件清单

| 文件 | 变更性质 | 职责描述 |
| --- | --- | --- |
| `src/services/presets.ts` | 修改 | 保留现有 `PRESET_SCENARIOS`，新增并导出代码级 6 大向导场景 `WIZARD_SCENARIOS` 及其变体 `ScenarioVariant`（Web 场景无 remotePort）。 |
| `src/services/profile-validator.ts` | 修改/重构 | 统一校验器、`buildScenarioProfile` 构造器、`ScenarioFormValues` 与 `ValidationResult` 类型定义。 |
| `src/services/profile-validator.test.ts` | 修改 | 校验器单元测试（必填项、端口区间、Web 域名、无核心 warning、NAS/游戏变体、Profile 与 TOML 构造）。 |
| `src/features/editor/ScenarioWizard.tsx` | 新增 | 场景向导组件：6 大用途卡片、变体联动、极简表单、只读 TOML 预览、连通性探测（成功保存 / 失败重试 / 失败仍然保存）、草稿传递 `onSwitchToAdvanced`。 |
| `src/features/editor/ScenarioWizard.test.tsx` | 新增 | 单元测试：场景卡片、变体联动、探测成功保存、探测失败重试、探测失败直接仍然保存、只读 TOML 展开与转高级编辑。 |
| `src/features/editor/ConfigEditorModal.tsx` | 修改 | 接入 `ScenarioWizard`，实现 `onSwitchToAdvanced(draft)` 草稿接管写入完整表单与 TOML，编辑模式标题统一为 `编辑连接: [名称]`。 |
| `src/features/editor/ConfigEditorModal.test.tsx` | 新增 | 单元测试：新建模式展示向导、编辑模式直达完整表单、转高级编辑时完整表单接管草稿数据。 |
| `src/App.tsx` | 修改 | 向 `<ConfigEditorModal>` 传入 `activeCore={activeCore}`。 |
| `src/App.test.tsx` | 修改 | 补充集成测试：向导新建连接 ➔ 弹窗关闭 ➔ 列表呈现 ➔ 8 个全量套件回归。 |
| `README.md` | 修改 | 完整替换并同步 P1-B 场景向导、变体与高级编辑说明。 |

---

### Task 1: 场景数据模型、变体定义与统一校验服务

**Files:**
- Modify: `src/services/presets.ts`
- Modify: `src/services/profile-validator.ts`
- Modify: `src/services/profile-validator.test.ts`

- [ ] **Step 1: 代码级定义场景与变体类型与数据 (编写测试)**

在 `src/services/profile-validator.test.ts` 中编写测试：

```ts
import { describe, it, expect } from 'vitest';
import { WIZARD_SCENARIOS, ScenarioVariant, WizardScenario } from './presets';
import { 
  validateProfileForm, 
  buildScenarioProfile, 
  ScenarioFormValues 
} from './profile-validator';
import { makeCore } from '../test/fixtures';

describe('profile-validator (场景预设、表单校验与 Profile 构造)', () => {
  it('从 presets 导出 6 大核心场景，且包含代码级默认值与变体 (Web 无 remotePort)', () => {
    expect(WIZARD_SCENARIOS).toHaveLength(6);
    const ids = WIZARD_SCENARIOS.map((s) => s.id);
    expect(ids).toEqual(['rdp', 'ssh', 'web', 'nas', 'game', 'custom']);

    const rdp = WIZARD_SCENARIOS.find((s) => s.id === 'rdp')!;
    expect(rdp.defaultName).toBe('我的 Windows 远程桌面');
    expect(rdp.defaultProxyName).toBe('rdp-desktop');
    expect(rdp.defaultLocalPort).toBe(3389);
    expect(rdp.defaultRemotePort).toBe(33389);
    expect(rdp.defaultType).toBe('tcp');

    const web = WIZARD_SCENARIOS.find((s) => s.id === 'web')!;
    expect(web.defaultName).toBe('我的 Web 网站');
    expect(web.defaultProxyName).toBe('web-app');
    expect(web.defaultLocalPort).toBe(8080);
    expect(web.defaultRemotePort).toBeUndefined();
    expect(web.defaultType).toBe('http');

    const nas = WIZARD_SCENARIOS.find((s) => s.id === 'nas')!;
    expect(nas.variants).toHaveLength(3);
    expect(nas.variants?.map((v) => v.id)).toEqual(['synology', 'alist', 'jellyfin']);
    expect(nas.variants?.[0].defaultLocalPort).toBe(5000);
    expect(nas.variants?.[1].defaultLocalPort).toBe(5244);
    expect(nas.variants?.[2].defaultLocalPort).toBe(8096);

    const game = WIZARD_SCENARIOS.find((s) => s.id === 'game')!;
    expect(game.variants).toHaveLength(4);
    expect(game.variants?.map((v) => v.id)).toEqual(['mc_java', 'mc_bedrock', 'terraria', 'custom_game']);
    expect(game.variants?.[0].defaultType).toBe('tcp');
    expect(game.variants?.[0].defaultLocalPort).toBe(25565);
    expect(game.variants?.[1].defaultType).toBe('udp');
    expect(game.variants?.[1].defaultLocalPort).toBe(19132);
  });

  it('校验必填项与端口合法区间 (1-65535)', () => {
    const invalidValues: ScenarioFormValues = {
      name: '',
      serverAddr: '',
      serverPort: 0,
      scenarioId: 'rdp',
      proxyName: 'rdp-desktop',
      proxyType: 'tcp',
      localIP: '127.0.0.1',
      localPort: 70000,
      remotePort: -1,
    };

    const res = validateProfileForm(invalidValues);
    expect(res.valid).toBe(false);
    expect(res.errors.name).toBe('请输入连接名称');
    expect(res.errors.serverAddr).toBe('请输入服务器地址');
    expect(res.errors.serverPort).toBe('服务器端口需在 1 - 65535 之间');
    expect(res.errors.localPort).toBe('本地端口需在 1 - 65535 之间');
    expect(res.errors.remotePort).toBe('远程端口需在 1 - 65535 之间');
  });

  it('Web 场景校验自定义域名且不强制校验远程端口', () => {
    const webNoDomain: ScenarioFormValues = {
      name: '我的博客',
      serverAddr: 'frp.example.com',
      serverPort: 7000,
      scenarioId: 'web',
      proxyName: 'web-blog',
      proxyType: 'http',
      localIP: '127.0.0.1',
      localPort: 8080,
      customDomains: [],
    };

    const res1 = validateProfileForm(webNoDomain);
    expect(res1.valid).toBe(false);
    expect(res1.errors.customDomains).toBe('请至少指定一个自定义域名');

    const res2 = validateProfileForm({
      ...webNoDomain,
      customDomains: ['blog.example.com'],
    });
    expect(res2.valid).toBe(true);
    expect(res2.errors.remotePort).toBeUndefined();
  });

  it('未配置核心时进入 warnings 且不阻断 valid=true', () => {
    const validValues: ScenarioFormValues = {
      name: '家庭 NAS',
      serverAddr: 'frp.example.com',
      serverPort: 7000,
      scenarioId: 'nas',
      variantId: 'synology',
      proxyName: 'nas-dsm',
      proxyType: 'tcp',
      localIP: '127.0.0.1',
      localPort: 5000,
      remotePort: 5000,
    };

    const resWithoutCore = validateProfileForm(validValues, { activeCore: null });
    expect(resWithoutCore.valid).toBe(true);
    expect(resWithoutCore.warnings.length).toBeGreaterThan(0);
    expect(resWithoutCore.warnings[0]).toContain('未配置本地 FRP 核心');

    const resWithCore = validateProfileForm(validValues, { activeCore: makeCore() });
    expect(resWithCore.valid).toBe(true);
    expect(resWithCore.warnings).toHaveLength(0);
  });

  it('buildScenarioProfile 生成合规 Profile 并正确序列化 rawToml', () => {
    const values: ScenarioFormValues = {
      name: 'Minecraft 游戏服',
      serverAddr: 'mc.frp.test',
      serverPort: 7000,
      authToken: 'secret-token-123',
      scenarioId: 'game',
      variantId: 'mc_bedrock',
      proxyName: 'mc-bedrock-server',
      proxyType: 'udp',
      localIP: '127.0.0.1',
      localPort: 19132,
      remotePort: 19132,
      useEncryption: true,
      useCompression: true,
    };

    const profile = buildScenarioProfile(values);
    expect(profile.name).toBe('Minecraft 游戏服');
    expect(profile.type).toBe('frpc');
    expect(profile.status).toBe('stopped');
    expect(profile.config).toMatchObject({
      serverAddr: 'mc.frp.test',
      serverPort: 7000,
      authToken: 'secret-token-123',
    });

    const conf: any = profile.config;
    expect(conf.proxies[0]).toMatchObject({
      name: 'mc-bedrock-server',
      type: 'udp',
      localPort: 19132,
      remotePort: 19132,
    });

    expect(profile.rawToml).toContain('serverAddr = "mc.frp.test"');
    expect(profile.rawToml).toContain('type = "udp"');
    expect(profile.rawToml).toContain('remotePort = 19132');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行：
```powershell
pnpm test src/services/profile-validator.test.ts
```

- [ ] **Step 3: 实施 presets.ts 与 profile-validator.ts**

在 `src/services/presets.ts` 中新增并导出：
```ts
export type ScenarioId = 'rdp' | 'ssh' | 'web' | 'nas' | 'game' | 'custom';

export interface ScenarioVariant {
  id: string;
  name: string;
  defaultLocalPort: number;
  defaultRemotePort?: number;
  defaultType: 'tcp' | 'udp' | 'http' | 'https';
  defaultName: string;
  defaultProxyName: string;
}

export interface WizardScenario {
  id: ScenarioId;
  name: string;
  badge: string;
  description: string;
  iconName: 'Monitor' | 'Terminal' | 'Globe' | 'HardDrive' | 'Gamepad2' | 'Sliders';
  defaultType: 'tcp' | 'udp' | 'http' | 'https';
  defaultLocalPort: number;
  defaultRemotePort?: number;
  defaultName: string;
  defaultProxyName: string;
  localPortPlaceholder: string;
  remotePortPlaceholder: string;
  tips: string;
  examples: { local: string; remote: string };
  variants?: ScenarioVariant[];
}

export const WIZARD_SCENARIOS: WizardScenario[] = [
  {
    id: 'rdp',
    name: 'Windows 远程桌面 (RDP)',
    badge: '推荐办公',
    description: '穿透本地 3389 端口，随时随地连接家中或公司 Windows 电脑桌面',
    iconName: 'Monitor',
    defaultType: 'tcp',
    defaultLocalPort: 3389,
    defaultRemotePort: 33389,
    defaultName: '我的 Windows 远程桌面',
    defaultProxyName: 'rdp-desktop',
    localPortPlaceholder: '3389',
    remotePortPlaceholder: '例如: 33389',
    tips: '提示：请在被控 Windows 电脑上开启“允许远程桌面”，公网设备使用微软官方远程桌面客户端连接即可。',
    examples: { local: '127.0.0.1:3389', remote: '服务器地址:33389' },
  },
  {
    id: 'ssh',
    name: 'SSH 远程终端',
    badge: '极客开发',
    description: '穿透本地 22 端口，在公网通过终端安全访问 Linux / macOS / Windows 命令行',
    iconName: 'Terminal',
    defaultType: 'tcp',
    defaultLocalPort: 22,
    defaultRemotePort: 6022,
    defaultName: '我的 SSH 终端',
    defaultProxyName: 'ssh-remote',
    localPortPlaceholder: '22',
    remotePortPlaceholder: '例如: 6022',
    tips: '连接命令示例：ssh username@服务器地址 -p 6022',
    examples: { local: '127.0.0.1:22', remote: 'ssh -p 6022' },
  },
  {
    id: 'web',
    name: '公开网站 (HTTP/HTTPS)',
    badge: '网站 / API',
    description: '通过自定义域名安全公开本地 Web 网站、前端项目或开发接口',
    iconName: 'Globe',
    defaultType: 'http',
    defaultLocalPort: 8080,
    defaultRemotePort: undefined,
    defaultName: '我的 Web 网站',
    defaultProxyName: 'web-app',
    localPortPlaceholder: '例如: 8080 或 3000',
    remotePortPlaceholder: '',
    tips: '提示：请配置自定义域名（需在 DNS 解析到 FRP 服务器公网 IP），公网用户通过浏览器访问该域名。',
    examples: { local: '127.0.0.1:8080', remote: 'http://app.example.com' },
  },
  {
    id: 'nas',
    name: '家庭 NAS / 私有云',
    badge: '家庭存储',
    description: '穿透家庭群晖 DSM、极空间、Alist、Jellyfin 影视库等私有云管理后台',
    iconName: 'HardDrive',
    defaultType: 'tcp',
    defaultLocalPort: 5000,
    defaultRemotePort: 5000,
    defaultName: '家庭 NAS 私有云',
    defaultProxyName: 'nas-storage',
    localPortPlaceholder: '5000 / 5244 / 8096',
    remotePortPlaceholder: '例如: 5000',
    tips: '提示：群晖默认 5000，Alist 默认 5244，Jellyfin/Emby 默认 8096。',
    examples: { local: '127.0.0.1:5000', remote: '服务器地址:5000' },
    variants: [
      { id: 'synology', name: '群晖 DSM (5000)', defaultLocalPort: 5000, defaultRemotePort: 5000, defaultType: 'tcp', defaultName: '群晖 NAS', defaultProxyName: 'synology-dsm' },
      { id: 'alist', name: 'Alist 网盘 (5244)', defaultLocalPort: 5244, defaultRemotePort: 5244, defaultType: 'tcp', defaultName: 'Alist 私有网盘', defaultProxyName: 'alist-web' },
      { id: 'jellyfin', name: 'Jellyfin/Emby (8096)', defaultLocalPort: 8096, defaultRemotePort: 8096, defaultType: 'tcp', defaultName: 'Jellyfin 影视库', defaultProxyName: 'jellyfin-media' },
    ],
  },
  {
    id: 'game',
    name: '游戏联机 (Minecraft 等)',
    badge: '游戏开黑',
    description: '穿透 Minecraft、泰拉瑞亚、幻兽帕鲁等本地架设的游戏私服与好友跨网联机',
    iconName: 'Gamepad2',
    defaultType: 'tcp',
    defaultLocalPort: 25565,
    defaultRemotePort: 25565,
    defaultName: 'Minecraft 游戏联机',
    defaultProxyName: 'mc-server',
    localPortPlaceholder: '25565 (Java) / 19132 (基岩)',
    remotePortPlaceholder: '例如: 25565',
    tips: '提示：Minecraft Java 版使用 TCP 25565，基岩版使用 UDP 19132。',
    examples: { local: '127.0.0.1:25565', remote: '服务器地址:25565' },
    variants: [
      { id: 'mc_java', name: 'Minecraft Java 版 (TCP 25565)', defaultLocalPort: 25565, defaultRemotePort: 25565, defaultType: 'tcp', defaultName: 'Minecraft Java 服务器', defaultProxyName: 'mc-java' },
      { id: 'mc_bedrock', name: 'Minecraft 基岩版 (UDP 19132)', defaultLocalPort: 19132, defaultRemotePort: 19132, defaultType: 'udp', defaultName: 'Minecraft 基岩服务器', defaultProxyName: 'mc-bedrock' },
      { id: 'terraria', name: '泰拉瑞亚 (TCP 7777)', defaultLocalPort: 7777, defaultRemotePort: 7777, defaultType: 'tcp', defaultName: '泰拉瑞亚联机服', defaultProxyName: 'terraria-server' },
      { id: 'custom_game', name: '其他自定义游戏', defaultLocalPort: 27015, defaultRemotePort: 27015, defaultType: 'tcp', defaultName: '自定义游戏服务器', defaultProxyName: 'game-server' },
    ],
  },
  {
    id: 'custom',
    name: '自定义连接 (高级模式)',
    badge: '自由配置',
    description: '自由定义任意 TCP / UDP / STCP / XTCP 端口映射或直接编辑 TOML 源码',
    iconName: 'Sliders',
    defaultType: 'tcp',
    defaultLocalPort: 3000,
    defaultRemotePort: 13000,
    defaultName: '我的自定义连接',
    defaultProxyName: 'custom-service',
    localPortPlaceholder: '本地监听端口',
    remotePortPlaceholder: '公网映射端口',
    tips: '提示：点击将直接进入完整高级配置模式。',
    examples: { local: '127.0.0.1:3000', remote: '服务器地址:13000' },
  },
];
```

在 `src/services/profile-validator.ts` 中实现：
- `ScenarioFormValues`
- `ValidationResult`
- `validateProfileForm(values: ScenarioFormValues, options?: { activeCore?: FrpCore | null }): ValidationResult`
- `buildScenarioProfile(values: ScenarioFormValues): Profile`

- [ ] **Step 4: 运行单元测试**

运行：
```powershell
pnpm test src/services/profile-validator.test.ts
```
预期：PASS，全部 5 个测试通过。

---

### Task 2: 场景化“新建连接”向导组件 (ScenarioWizard)

**Files:**
- Create: `src/features/editor/ScenarioWizard.tsx`
- Create: `src/features/editor/ScenarioWizard.test.tsx`

- [ ] **Step 1: 编写 ScenarioWizard 单元测试（独立覆盖探测成功、失败重试、失败直接仍然保存、草稿接管）**

创建 `src/features/editor/ScenarioWizard.test.tsx`：

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { ScenarioWizard } from './ScenarioWizard';
import { makeCore } from '../../test/fixtures';
import * as ipc from '../../services/ipc';

vi.mock('../../services/ipc', () => ({
  testServerConnectivity: vi.fn(),
}));

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('ScenarioWizard (场景化新建连接向导)', () => {
  it('步骤一渲染 6 大场景卡片，点击自定义连接直接触发 onSwitchToAdvanced', async () => {
    const user = userEvent.setup();
    const onSwitchToAdvanced = vi.fn();

    render(
      <ScenarioWizard
        onCancel={vi.fn()}
        onComplete={vi.fn()}
        onSwitchToAdvanced={onSwitchToAdvanced}
        activeCore={makeCore()}
      />
    );

    expect(screen.getByText('选择连接用途')).toBeInTheDocument();
    expect(screen.getByText('Windows 远程桌面 (RDP)')).toBeInTheDocument();
    expect(screen.getByText('SSH 远程终端')).toBeInTheDocument();
    expect(screen.getByText('公开网站 (HTTP/HTTPS)')).toBeInTheDocument();
    expect(screen.getByText('家庭 NAS / 私有云')).toBeInTheDocument();
    expect(screen.getByText('游戏联机 (Minecraft 等)')).toBeInTheDocument();
    expect(screen.getByText('自定义连接 (高级模式)')).toBeInTheDocument();

    await user.click(screen.getByText('自定义连接 (高级模式)'));
    expect(onSwitchToAdvanced).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarioId: 'custom',
      })
    );
  });

  it('选择 NAS 场景支持切换群晖/Alist/Jellyfin 变体并自动更新端口与默认名称', async () => {
    const user = userEvent.setup();

    render(
      <ScenarioWizard
        onCancel={vi.fn()}
        onComplete={vi.fn()}
        onSwitchToAdvanced={vi.fn()}
        activeCore={makeCore()}
      />
    );

    await user.click(screen.getByText('家庭 NAS / 私有云'));
    expect(screen.getByText('配置家庭 NAS / 私有云')).toBeInTheDocument();

    // 默认群晖 DSM: 5000
    expect(screen.getByDisplayValue('5000')).toBeInTheDocument();

    // 切换到 Alist
    const alistVariantBtn = screen.getByRole('button', { name: /Alist 网盘/ });
    await user.click(alistVariantBtn);

    expect(screen.getByDisplayValue('5244')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Alist 私有网盘')).toBeInTheDocument();
  });

  it('连通性探测成功时直接保存并调用 onComplete', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    vi.mocked(ipc.testServerConnectivity).mockResolvedValueOnce({
      server: 'good.frp.test',
      port: 7000,
      latencyMs: 18,
      status: 'success',
      timestamp: '10:00:00',
    });

    render(
      <ScenarioWizard
        onCancel={vi.fn()}
        onComplete={onComplete}
        onSwitchToAdvanced={vi.fn()}
        activeCore={makeCore()}
      />
    );

    await user.click(screen.getByText('SSH 远程终端'));

    const serverInput = screen.getByPlaceholderText(/例如: frp.example.com/);
    await user.clear(serverInput);
    await user.type(serverInput, 'good.frp.test');

    const checkAndSaveBtn = screen.getByRole('button', { name: '检查并保存' });
    await user.click(checkAndSaveBtn);

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '我的 SSH 终端',
          config: expect.objectContaining({
            serverAddr: 'good.frp.test',
          }),
        })
      );
    });
  });

  it('连通性探测失败时展示错误提示，且支持重试检测成功后保存', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    // 第一次探测失败
    vi.mocked(ipc.testServerConnectivity).mockResolvedValueOnce({
      server: 'unreachable.test',
      port: 7000,
      latencyMs: null,
      status: 'failed',
      error: '连接超时，无法握手',
      timestamp: '10:00:00',
    });

    render(
      <ScenarioWizard
        onCancel={vi.fn()}
        onComplete={onComplete}
        onSwitchToAdvanced={vi.fn()}
        activeCore={makeCore()}
      />
    );

    await user.click(screen.getByText('SSH 远程终端'));

    const serverInput = screen.getByPlaceholderText(/例如: frp.example.com/);
    await user.clear(serverInput);
    await user.type(serverInput, 'unreachable.test');

    const checkAndSaveBtn = screen.getByRole('button', { name: '检查并保存' });
    await user.click(checkAndSaveBtn);

    // 探测失败展示提示，且不自动保存
    expect(await screen.findByText(/连接超时，无法握手/)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    // 点击重试检测 (mock 第二次返回成功)
    vi.mocked(ipc.testServerConnectivity).mockResolvedValueOnce({
      server: 'unreachable.test',
      port: 7000,
      latencyMs: 25,
      status: 'success',
      timestamp: '10:00:01',
    });

    const retryBtn = screen.getByRole('button', { name: '重试检测' });
    await user.click(retryBtn);

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            serverAddr: 'unreachable.test',
          }),
        })
      );
    });
  });

  it('连通性探测失败时，点击【仍然保存】可以在失败状态下直接强制保存', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    vi.mocked(ipc.testServerConnectivity).mockResolvedValueOnce({
      server: 'offline-host.test',
      port: 7000,
      latencyMs: null,
      status: 'failed',
      error: '目标主机离线',
      timestamp: '10:00:00',
    });

    render(
      <ScenarioWizard
        onCancel={vi.fn()}
        onComplete={onComplete}
        onSwitchToAdvanced={vi.fn()}
        activeCore={makeCore()}
      />
    );

    await user.click(screen.getByText('SSH 远程终端'));

    const serverInput = screen.getByPlaceholderText(/例如: frp.example.com/);
    await user.clear(serverInput);
    await user.type(serverInput, 'offline-host.test');

    const checkAndSaveBtn = screen.getByRole('button', { name: '检查并保存' });
    await user.click(checkAndSaveBtn);

    expect(await screen.findByText(/目标主机离线/)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    // 点击【仍然保存】
    const forceSaveBtn = screen.getByRole('button', { name: '仍然保存' });
    await user.click(forceSaveBtn);

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '我的 SSH 终端',
        config: expect.objectContaining({
          serverAddr: 'offline-host.test',
        }),
      })
    );
  });

  it('展开高级设置展示只读 TOML 预览并支持点击“转为高级编辑”传递完整草稿', async () => {
    const user = userEvent.setup();
    const onSwitchToAdvanced = vi.fn();

    render(
      <ScenarioWizard
        onCancel={vi.fn()}
        onComplete={vi.fn()}
        onSwitchToAdvanced={onSwitchToAdvanced}
        activeCore={makeCore()}
      />
    );

    await user.click(screen.getByText('SSH 远程终端'));

    const serverInput = screen.getByPlaceholderText(/例如: frp.example.com/);
    await user.clear(serverInput);
    await user.type(serverInput, 'draft.frp.test');

    const advancedToggle = screen.getByRole('button', { name: /高级参数与 TOML 预览/ });
    await user.click(advancedToggle);

    // 存在只读 TOML 源码区域
    expect(screen.getByText(/serverAddr = "draft\.frp\.test"/)).toBeInTheDocument();

    const switchBtn = screen.getByRole('button', { name: '转为高级编辑模式' });
    await user.click(switchBtn);

    expect(onSwitchToAdvanced).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarioId: 'ssh',
        serverAddr: 'draft.frp.test',
        localPort: 22,
        remotePort: 6022,
      })
    );
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行：
```powershell
pnpm test src/features/editor/ScenarioWizard.test.tsx
```

- [ ] **Step 3: 实施 ScenarioWizard 组件**

创建 `src/features/editor/ScenarioWizard.tsx`：
1. 包含 `step: 'choose_scenario' | 'fill_form'`；
2. 步骤一渲染 6 个大卡片，点击 `custom` 触发 `onSwitchToAdvanced`；
3. 步骤二渲染场景表单，变体切换按钮，Token 密码框与显隐切换；Web 场景只渲染本地端口和自定义域名；
4. 高级设置折叠抽屉：只读展示 `profile.rawToml`，提供【转为高级编辑模式】；
5. “检查并保存”：本地校验 ➔ 连通性探测 ➔ 成功直接 `onComplete` / 失败展示错误浮层并提供【重试检测】与【仍然保存】。

- [ ] **Step 4: 运行 ScenarioWizard 单元测试**

运行：
```powershell
pnpm test src/features/editor/ScenarioWizard.test.tsx
```
预期：PASS，全部 6 个测试通过。

---

### Task 3: ConfigEditorModal 接入向导、草稿接管与编辑模式标题统一

**Files:**
- Modify: `src/features/editor/ConfigEditorModal.tsx`
- Create: `src/features/editor/ConfigEditorModal.test.tsx`

- [ ] **Step 1: 编写 ConfigEditorModal 单元测试（包含草稿字段接管断言）**

创建 `src/features/editor/ConfigEditorModal.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { ConfigEditorModal } from './ConfigEditorModal';
import { makeProfile, makeCore } from '../../test/fixtures';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('ConfigEditorModal (新建向导与编辑弹窗)', () => {
  it('新建模式 (editingProfile 为 null) 时默认渲染场景化向导', () => {
    render(
      <ConfigEditorModal
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        editingProfile={null}
        activeCore={makeCore()}
      />
    );

    expect(screen.getByText('新建内网穿透连接')).toBeInTheDocument();
    expect(screen.getByText('选择连接用途')).toBeInTheDocument();
    expect(screen.getByText('Windows 远程桌面 (RDP)')).toBeInTheDocument();
  });

  it('编辑模式 (editingProfile 存在) 时标题统一为“编辑连接: [名称]”并渲染完整表单', () => {
    const existing = makeProfile({ name: '家庭 NAS 存储', status: 'stopped' });

    render(
      <ConfigEditorModal
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        editingProfile={existing}
        activeCore={makeCore()}
      />
    );

    expect(screen.getByText('编辑连接: 家庭 NAS 存储')).toBeInTheDocument();
    expect(screen.getByDisplayValue('家庭 NAS 存储')).toBeInTheDocument();
  });

  it('在向导中填写表单后点击“转为高级编辑”，完整表单能够准确接管草稿中的服务器、Token 与端口', async () => {
    const user = userEvent.setup();

    render(
      <ConfigEditorModal
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        editingProfile={null}
        activeCore={makeCore()}
      />
    );

    // 选择 SSH
    await user.click(screen.getByText('SSH 远程终端'));

    // 填写草稿字段
    const serverInput = screen.getByPlaceholderText(/例如: frp.example.com/);
    await user.clear(serverInput);
    await user.type(serverInput, 'takeover.frp.test');

    const tokenInput = screen.getByPlaceholderText(/如服务端已设置 token/);
    await user.type(tokenInput, 'pass123456');

    // 展开高级设置并转为高级编辑
    const advancedToggle = screen.getByRole('button', { name: /高级参数与 TOML 预览/ });
    await user.click(advancedToggle);

    const switchBtn = screen.getByRole('button', { name: '转为高级编辑模式' });
    await user.click(switchBtn);

    // 切入完整编辑视图，且输入框内已自动填充草稿值
    expect(screen.getByText('可视化表单')).toBeInTheDocument();
    expect(screen.getByDisplayValue('takeover.frp.test')).toBeInTheDocument();
    expect(screen.getByDisplayValue('pass123456')).toBeInTheDocument();
    expect(screen.getByDisplayValue('6022')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行：
```powershell
pnpm test src/features/editor/ConfigEditorModal.test.tsx
```

- [ ] **Step 3: 改造 ConfigEditorModal**

在 `src/features/editor/ConfigEditorModal.tsx` 中：
1. 声明 `interface ConfigEditorModalProps { isOpen: boolean; onClose: () => void; onSave: (profile: Profile) => void; editingProfile: Profile | null; activeCore: FrpCore | null; }`；
2. 管理 `isWizardMode: boolean`，新建模式默认为 `true`；
3. 实现 `handleSwitchToAdvanced(draft: ScenarioFormValues)`，将 `draft` 中的字段同步写入完整表单状态（`profileName`、`serverAddr`、`serverPort`、`authToken`、`proxies`、`rawToml`）；
4. 挂载 `<ScenarioWizard>`，保存时调用 `onSave(profile); onClose();`；
5. 编辑模式下标题统一为 `编辑连接: ${editingProfile.name}`。

- [ ] **Step 4: 运行 ConfigEditorModal 单元测试**

运行：
```powershell
pnpm test src/features/editor/ConfigEditorModal.test.tsx
```
预期：PASS，全部 3 个测试通过。

---

### Task 4: App 集成与 8 个测试套件全量回归

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: 编写 App 新建连接向导端到端集成测试**

在 `src/App.test.tsx` 中新增端到端用例：

```tsx
it('从“我的连接”点击“新建连接”唤起场景向导，保存后弹窗关闭并在列表呈现', async () => {
  const user = userEvent.setup();

  render(
    <MemoryRouter initialEntries={['/profiles']}>
      <AppLayout />
    </MemoryRouter>
  );

  const createBtn = screen.getByRole('button', { name: /新建连接/ });
  await user.click(createBtn);

  expect(screen.getByText('选择连接用途')).toBeInTheDocument();
  await user.click(screen.getByText('Windows 远程桌面 (RDP)'));

  const serverInput = screen.getByPlaceholderText(/例如: frp.example.com/);
  await user.clear(serverInput);
  await user.type(serverInput, 'work.frp.test');

  const tokenInput = screen.getByPlaceholderText(/如服务端已设置 token/);
  await user.type(tokenInput, 'my-super-secret-token');

  const saveBtn = screen.getByRole('button', { name: '检查并保存' });
  await user.click(saveBtn);

  // 弹窗关闭
  await waitFor(() => {
    expect(screen.queryByText('选择连接用途')).not.toBeInTheDocument();
  });

  // 列表中呈现新连接，且页面上不包含明文 Token
  expect(screen.getByText('我的 Windows 远程桌面')).toBeInTheDocument();
  expect(screen.queryByText('my-super-secret-token')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 实施 App.tsx 接入**

在 `src/App.tsx` 中向 `<ConfigEditorModal>` 传入 `activeCore={activeCore}`。

- [ ] **Step 3: 运行全量 8 个测试套件**

运行：
```powershell
pnpm test
```
预期：全量 8 个测试套件（`profile-validator.test.ts`、`ScenarioWizard.test.tsx`、`ConfigEditorModal.test.tsx`、`DashboardOverview.test.tsx`、`ProfileCard.test.tsx`、`ProfileList.test.tsx`、`DiagnosticModal.test.tsx`、`App.test.tsx`）全部通过。

---

### Task 5: README 文档全文同步与生产构建

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 运行生产构建与 TypeScript 类型检查**

运行：
```powershell
pnpm build
```
预期：0 错误，打包成功。

- [ ] **Step 2: 更新 README.md 全文内容**

将 `README.md` 替换为以下完整 Markdown 内容：

```markdown
# FRP-GUI Pro - 跨平台内网穿透图形化管理工具

一款现代、轻量、开箱即用的跨平台 FRP (Fast Reverse Proxy) 图形化管理客户端与控制台，支持 **Windows、macOS、Linux 和 Android**。

彻底告别繁琐易错的手动 `frpc.toml` / `frps.toml` 配置文件编写，支持场景化新建连接向导、可视化交互配置与 TOML 源码双向无损实时同步。

---

## 🧭 核心功能与工作台架构

### 1. 场景化“新建连接”向导 (Scenario Wizard)
- **按用途选择**：无需纠结客户端/服务端概念，首屏直观提供 6 大应用场景：
  - 🖥️ **Windows 远程桌面 (RDP)**：自动预填本地 3389 ➔ 推荐远程端口 33389；
  - 💻 **SSH 远程终端**：自动预填本地 22 ➔ 推荐远程端口 6022；
  - 🌐 **公开网站 (HTTP/HTTPS)**：仅需填写本地 Web 端口 ➔ 自定义域名绑定（无远程端口繁琐配置）；
  - 🏠 **家庭 NAS / 私有云**：提供群晖 DSM (5000)、Alist (5244)、Jellyfin (8096) 变体联动；
  - 🎮 **游戏联机 (Minecraft 等)**：提供 Minecraft Java (TCP 25565)、基岩版 (UDP 19132)、泰拉瑞亚 (TCP 7777) 协议与端口变体；
  - ⚙️ **自定义连接 (高级模式)**：一键转入完整表单与 TOML 编辑器。
- **“检查并保存”智能流转**：
  - 本地字段与合法端口区间（1-65535）校验；
  - 自动触发 TCP 连通性探测：探测成功直接入库；探测失败醒目展示原因，并提供【重试检测】与【仍然保存】（支持离线配置）；
  - Token 安全密码框掩码保护，严禁明文回显与泄露；
  - 高级设置抽屉：提供只读动态 TOML 预览与【转为高级编辑模式】草稿完整接管出口。

### 2. 我的连接工作台 (`/profiles`)
- **单一主操作**：根据运行状态展示唯一的“启动连接 / 停止连接 / 立即排查 / 启动中...”，次级操作收敛至气泡菜单；
- **正交筛选模型**：状态 Tab、连接类型下拉与关键字搜索正交过滤，条件变更即时重置分页；
- **双视图切换**：卡片看板与飞书多维表格无缝切换。

### 3. 运行状态看板 (`/dashboard`)
- 实时监控在线穿透隧道、运行实例与公网访问命令；
- 存在异常连接时展示黄色引导横幅，一键定向打开首个异常方案诊断。

### 4. 实时日志 (`/logs`) 与 FRP 核心管理 (`/cores`)
- 多连接独立与聚合实时日志流查看、级别分流与日志导出；
- 本地 FRP 核心自动识别与 GitHub Release 在线高速下载切换。

---

## 🛠️ 技术架构

- **前端架构**：React 19 + TypeScript + Vite + Tailwind CSS + Radix UI + Lucide Icons + smol-toml
- **后端架构**：Tauri v2 (Rust 异步进程管控与网络探测)
- **多端适配**：
  - **Desktop (Win / macOS / Linux)**：原生子进程托管 + 系统托盘 + 实时日志管道
  - **Mobile (Android)**：Foreground Service 前台常驻通知 + 扫码导入
  - **Web / 模拟模式**：内置完整的本地仿真与日志流引擎，无需安装 Rust 即可在浏览器即刻预览

---

## 🚀 快速启动

```bash
# 1. 安装依赖
pnpm install

# 2. 运行自动化测试套件 (8 个测试套件)
pnpm test

# 3. 运行前端开发环境
pnpm dev

# 4. 生产打包
pnpm build
```
```

- [ ] **Step 3: 人工走查 6 大场景全流程**

走查 6 大场景选择、变体联动、探测成功直接保存、探测失败展示/重试/仍然保存、转高级编辑与 Token 掩码全流程。
