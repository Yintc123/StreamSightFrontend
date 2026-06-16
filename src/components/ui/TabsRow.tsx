'use client'
import type { ResourceKey } from '@/lib/schemas/list'

type TabsRowProps = {
  active: ResourceKey
  onTabChange: (next: ResourceKey) => void
}

const TABS: { key: ResourceKey; label: string }[] = [
  { key: 'charity', label: '公益團體' },
  { key: 'donation', label: '捐款專案' },
  { key: 'item', label: '義賣商品' },
]

export function TabsRow({ active, onTabChange }: TabsRowProps) {
  return (
    <div data-component="TabsRow" role="tablist" className="flex w-full h-11 border-b border-black/5">
      {TABS.map((t) => {
        const isActive = t.key === active
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(t.key)}
            className="flex-1 flex items-center justify-center relative
                       focus-visible:outline focus-visible:outline-2
                       focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
          >
            <span
              className={
                isActive
                  ? 'text-base font-medium text-ink-AAA leading-6'
                  : 'text-sm font-medium text-ink-AAA leading-[19px]'
              }
            >
              {t.label}
            </span>
            {isActive && (
              <span
                aria-hidden
                className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] w-full bg-brand-400 rounded-t-sm"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
