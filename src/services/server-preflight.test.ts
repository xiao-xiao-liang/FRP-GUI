import { describe, expect, it, vi } from 'vitest';
import { runServerPreflight } from './ipc';

describe('runServerPreflight IPC', () => {
  it('桌面模式只传递结构化白名单字段，发送对象的键集合完全符合白名单契约', async () => {
    const invokeSpy = vi.fn().mockResolvedValue({
      outcome: 'ready',
      checkedAt: 1,
    });
    (window as any).__TAURI__ = { core: { invoke: invokeSpy } };

    await runServerPreflight({
      node: {
        id: 'node-1',
        host: '203.0.113.10',
        sshPort: 22,
        username: 'root',
        authMethod: 'password',
        credentialsRemembered: false,
      },
      acceptedHostKeyFingerprint: 'SHA256:abc',
      ephemeralCredentials: { password: 'test-secret' },
    });

    expect(invokeSpy).toHaveBeenCalledTimes(1);
    const [command, payload] = invokeSpy.mock.calls[0];
    expect(command).toBe('run_server_preflight');

    const sentRequest = payload.request;
    expect(Object.keys(sentRequest).sort()).toEqual(['acceptedHostKeyFingerprint', 'ephemeralCredentials', 'node'].sort());
    expect(Object.keys(sentRequest.node).sort()).toEqual(
      ['id', 'host', 'sshPort', 'username', 'authMethod', 'credentialRef', 'credentialsRemembered', 'trustedHostKeyFingerprint'].sort()
    );
    expect(Object.keys(sentRequest.ephemeralCredentials).sort()).toEqual(
      ['password', 'privateKey', 'privateKeyPassphrase'].sort()
    );
  });

  it('分别注入 command 和 shell 字段时，前端白名单重构确保其均被剔除且不被发送', async () => {
    const invokeSpy = vi.fn().mockResolvedValue({
      outcome: 'ready',
      checkedAt: 1,
    });
    (window as any).__TAURI__ = { core: { invoke: invokeSpy } };

    // 1. 注入 command
    const requestWithCommand: any = {
      node: {
        id: 'node-1',
        host: '203.0.113.10',
        sshPort: 22,
        username: 'root',
        authMethod: 'password',
        credentialsRemembered: false,
        command: 'rm -rf /',
      },
      command: 'cat /etc/shadow',
      ephemeralCredentials: {
        password: 'test-secret',
        command: 'whoami',
      },
    };

    await runServerPreflight(requestWithCommand);
    const sentReq1 = invokeSpy.mock.calls[0][1].request;
    expect('command' in sentReq1).toBe(false);
    expect('command' in sentReq1.node).toBe(false);
    expect('command' in sentReq1.ephemeralCredentials).toBe(false);
    expect(JSON.stringify(sentReq1)).not.toContain('command');

    // 2. 注入 shell
    invokeSpy.mockClear();
    const requestWithShell: any = {
      node: {
        id: 'node-1',
        host: '203.0.113.10',
        sshPort: 22,
        username: 'root',
        authMethod: 'password',
        credentialsRemembered: false,
        shell: '/bin/bash',
      },
      shell: 'sh -c evil',
      ephemeralCredentials: {
        password: 'test-secret',
        shell: 'bash',
      },
    };

    await runServerPreflight(requestWithShell);
    const sentReq2 = invokeSpy.mock.calls[0][1].request;
    expect('shell' in sentReq2).toBe(false);
    expect('shell' in sentReq2.node).toBe(false);
    expect('shell' in sentReq2.ephemeralCredentials).toBe(false);
    expect(JSON.stringify(sentReq2)).not.toContain('shell');
  });

  it('浏览器环境明确拒绝预检，而不是返回模拟成功', async () => {
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;

    await expect(
      runServerPreflight({
        node: {
          id: 'node-1',
          host: '203.0.113.10',
          sshPort: 22,
          username: 'root',
          authMethod: 'password',
          credentialsRemembered: false,
        },
      })
    ).rejects.toThrow('仅桌面版支持 SSH 预检');
  });
});
