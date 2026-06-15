import type { ReactNode } from 'react'

type DisclaimerBoxProps = {
  children: ReactNode
  className?: string
}

export const DISCLAIMER_PLATFORM =
  '街口金融科技作為捐款平台之服務提供者，將會蒐集、處理或利用捐款人填寫之個人資料，並僅提供予機關團體作為收據開立及稅務目的之使用。'

export function DisclaimerBox({
  children,
  className = '',
}: DisclaimerBoxProps) {
  return (
    <p
      className={`bg-black/5 text-xs text-ink-AA p-3 rounded-md leading-5 ${className}`}
    >
      {children}
    </p>
  )
}
