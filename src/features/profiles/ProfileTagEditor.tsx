import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { validateTag, normalizeTag } from '../../services/profile-organization';
import { cn } from '../../lib/utils';

export interface ProfileTagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  className?: string;
}

export const ProfileTagEditor: React.FC<ProfileTagEditorProps> = ({
  tags = [],
  onChange,
  disabled = false,
  className,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleAdd = () => {
    if (disabled) return;
    const res = validateTag(inputValue, tags);
    if (!res.valid) {
      setErrorMessage(res.error || '标签不合法');
      return;
    }

    const normalized = normalizeTag(inputValue);
    onChange([...tags, normalized]);
    setInputValue('');
    setErrorMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleRemove = (index: number) => {
    if (disabled) return;
    onChange(tags.filter((_, i) => i !== index));
    setErrorMessage('');
  };

  return (
    <div className={cn('space-y-2 select-none', className)}>
      <div className="flex items-center justify-between">
        <label className="block text-[12px] font-medium text-[#1F2329]">
          标签 (选填)
        </label>
        <span className="text-[11px] text-[#8F959E] tabular-nums">
          {tags.length}/10
        </span>
      </div>

      {/* 已有标签展示 */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 min-h-[26px]">
          {tags.map((tag, index) => (
            <span
              key={`${tag}-${index}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#F2F3F5] text-[12px] text-[#1F2329] font-medium border border-[#E5E6EB]"
            >
              <span className="truncate max-w-[180px]">{tag}</span>
              {!disabled && (
                <button
                  type="button"
                  aria-label={`删除标签 ${tag}`}
                  onClick={() => handleRemove(index)}
                  className="p-0.5 rounded-full text-[#8F959E] hover:text-[#F53F3F] hover:bg-[#E5E6EB] transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* 添加新标签输入行 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={inputValue}
            disabled={disabled || tags.length >= 10}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (errorMessage) setErrorMessage('');
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              tags.length >= 10
                ? '已达 10 个标签上限'
                : '输入标签名称（1–24 字符），按回车或点击添加...'
            }
            className={cn(
              'w-full h-8 px-3 text-[13px] rounded-[6px] border bg-white text-[#1F2329] placeholder:text-[#8F959E] focus:outline-none transition-colors',
              errorMessage
                ? 'border-[#F53F3F] focus:border-[#F53F3F]'
                : 'border-[#DEE0E3] focus:border-[#165DFF]',
              (disabled || tags.length >= 10) && 'bg-[#F2F3F5] text-[#8F959E] cursor-not-allowed'
            )}
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || tags.length >= 10}
          onClick={handleAdd}
          className="h-8 px-3 text-[12px] rounded-[6px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F2F3F5] shrink-0"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          添加标签
        </Button>
      </div>

      {/* 错误提示 */}
      {errorMessage && (
        <p className="text-[12px] text-[#F53F3F] leading-tight">
          {errorMessage}
        </p>
      )}
    </div>
  );
};
