type InlineErrorProps = {
  message?: string
  onRetry: () => void
}

export function InlineError({
  message = '連線失敗，請稍候再試',
  onRetry,
}: InlineErrorProps) {
  return (
    <div
      data-component="InlineError"
      role="alert"
      className="flex flex-col items-center gap-3 py-8 px-4 text-center"
    >
      <p className="text-sm text-ink-AA">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 bg-brand text-white rounded-full text-sm
                   hover:opacity-90 active:opacity-80
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        重試
      </button>
    </div>
  )
}
