import React, { useMemo } from 'react';
import { Profile } from '../../types/frp';
import { FeishuDialog } from '../../components/ui/FeishuDialog';
import { FeishuDataTable, FeishuColumn } from '../../components/ui/feishu-table';
import { ProxyTypePill } from './proxy-type-presentation';

export interface ProfileRuleDetailsDialogProps {
  visible: boolean;
  profile: Profile | null;
  onClose: () => void;
}

export interface RuleDetailRow {
  id: string;
  name: string;
  type: string;
  localIP: string;
  localPort: string | number;
  remotePort: string | number;
}

const COLUMNS: FeishuColumn<RuleDetailRow>[] = [
  {
    key: 'name',
    title: '名称',
    dataIndex: 'name',
    width: 140,
    render: (val) => val || '—',
  },
  {
    key: 'type',
    title: '协议类型',
    dataIndex: 'type',
    width: 90,
    render: (val) => (val && val !== '—' ? <ProxyTypePill type={String(val)} /> : '—'),
  },
  {
    key: 'localIP',
    title: '本地 IP',
    dataIndex: 'localIP',
    width: 130,
    render: (val) => val || '—',
  },
  {
    key: 'localPort',
    title: '本地端口',
    dataIndex: 'localPort',
    width: 100,
    render: (val) => (val !== undefined && val !== null && val !== '' ? String(val) : '—'),
  },
  {
    key: 'remotePort',
    title: '远程端口',
    dataIndex: 'remotePort',
    width: 100,
    render: (val) => (val !== undefined && val !== null && val !== '' ? String(val) : '—'),
  },
];

export const ProfileRuleDetailsDialog: React.FC<ProfileRuleDetailsDialogProps> = ({
  visible,
  profile,
  onClose,
}) => {
  const rows = useMemo<RuleDetailRow[]>(() => {
    const config = profile?.config;
    if (!config || !('proxies' in config) || !Array.isArray(config.proxies)) {
      return [];
    }

    return config.proxies.map((proxy: any, idx: number) => ({
      id: `${proxy.name || idx}-${idx}`,
      name: proxy.name || '—',
      type: proxy.type || '—',
      localIP: proxy.localIP || '—',
      localPort: proxy.localPort !== undefined && proxy.localPort !== null ? proxy.localPort : '—',
      remotePort: proxy.remotePort !== undefined && proxy.remotePort !== null ? proxy.remotePort : '—',
    }));
  }, [profile]);

  if (!visible) {
    return null;
  }

  return (
    <FeishuDialog
      visible={visible}
      title="规则详情"
      width={680}
      onCancel={onClose}
      footer={null}
    >
      <div className="pt-2">
        <FeishuDataTable<RuleDetailRow>
          columns={COLUMNS}
          data={rows}
          rowKey="id"
          selectable={false}
          searchable={false}
        />
      </div>
    </FeishuDialog>
  );
};
