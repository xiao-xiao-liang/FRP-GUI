import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, it, expect } from 'vitest';
import { DiagnosticModal } from './DiagnosticModal';
import { makeProfile } from '../../test/fixtures';

vi.mock('../../services/ipc', () => ({
  testServerConnectivity: vi.fn().mockResolvedValue({
    server: 'frp.example.test',
    port: 7000,
    latencyMs: 18,
    status: 'success',
    timestamp: '10:00:00',
  }),
}));

it('预填目标方案并将检测结果回传给应用层 (手工测试传 null)', async () => {
  const user = userEvent.setup();
  const onDiagnosticComplete = vi.fn();
  render(
    <DiagnosticModal
      isOpen
      onClose={vi.fn()}
      profiles={[makeProfile()]}
      selectedProfile={makeProfile()}
      onDiagnosticComplete={onDiagnosticComplete}
    />
  );

  expect(screen.getByDisplayValue('frp.example.test')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '开始连通性测试' }));
  expect(onDiagnosticComplete).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'success', latencyMs: 18 }),
    null
  );
});

it('从方案 A 打开诊断后探测方案 B，回传结果携带方案 B 的 ID', async () => {
  const user = userEvent.setup();
  const onDiagnosticComplete = vi.fn();
  const profileA = makeProfile({ id: 'profile-a', name: '方案 A' });
  const profileB = makeProfile({
    id: 'profile-b',
    name: '方案 B',
    config: {
      serverAddr: 'b.example.test',
      serverPort: 7001,
      proxies: [],
      visitors: [],
    },
  });

  render(
    <DiagnosticModal
      isOpen
      onClose={vi.fn()}
      profiles={[profileA, profileB]}
      selectedProfile={profileA}
      onDiagnosticComplete={onDiagnosticComplete}
    />
  );

  await user.click(screen.getByRole('button', { name: /方案 B/ }));
  expect(onDiagnosticComplete).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'success' }),
    'profile-b'
  );
});
