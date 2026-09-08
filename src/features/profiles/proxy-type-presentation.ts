import React from 'react';
import { FeishuPill, FeishuPillVariant } from '../../components/ui/feishu-table/FeishuPill';

export function proxyTypeVariant(type?: string): FeishuPillVariant {
  const normalized = (type || '').trim().toLowerCase();
  switch (normalized) {
    case 'tcp':
      return 'blue';
    case 'udp':
      return 'cyan';
    case 'http':
      return 'green';
    case 'https':
      return 'purple';
    default:
      return 'gray';
  }
}

export interface ProxyTypePillProps {
  type?: string;
  className?: string;
}

export const ProxyTypePill: React.FC<ProxyTypePillProps> = ({ type, className }) => {
  const normalized = (type || '').trim().toLowerCase();
  const variant = proxyTypeVariant(type);
  const displayLabel = (type || '未知').toUpperCase();

  return React.createElement(
    'span',
    {
      'data-proxy-type': normalized || 'unknown',
      className: 'inline-flex items-center shrink-0',
    },
    React.createElement(
      FeishuPill,
      {
        variant,
        showDot: false,
        className: className || 'text-[11px] h-[20px] px-1.5 font-medium shrink-0 leading-none',
        children: displayLabel,
      }
    )
  );
};
