'use client'
import { useRef } from 'react'

type SearchBarProps = {
  value: string
  onChange: (next: string) => void
  /** 點「取消」時呼叫；元件內會 blur input + 清空 value */
  onCancel?: () => void
  placeholder?: string
  /** mount 時自動 focus input（搜尋模式進入時開鍵盤） */
  autoFocus?: boolean
}

export function SearchBar({
  value,
  onChange,
  onCancel,
  placeholder = '搜尋公益團體',
  autoFocus = false,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleCancel = () => {
    onChange('')
    onCancel?.()
    inputRef.current?.blur()
  }

  return (
    <div className="flex items-center w-full">
      <div className="flex-1 flex items-center gap-[9px] py-[9px] px-3 bg-black/5 rounded-[20px]">
        {/* SVG 20×20 icon — spec 003a §4 允許 <img>；不需 next/image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/figma/icon-magnifier.svg"
          alt=""
          width={20}
          height={20}
          className="w-5 h-5 shrink-0 opacity-50"
        />
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="flex-1 bg-transparent text-sm leading-[22px]
                     text-ink-AAA placeholder:text-ink-A focus:outline-none"
        />
      </div>
      {onCancel && (
        <button
          type="button"
          onClick={handleCancel}
          className="py-[6px] pl-3 text-base leading-6 text-ink-link shrink-0
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand rounded"
        >
          取消
        </button>
      )}
    </div>
  )
}
