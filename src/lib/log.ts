import 'server-only'

type LogObj = Record<string, unknown>
type Level = 'info' | 'warn' | 'error'

function emit(level: Level, obj: LogObj, event: string): void {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...obj })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const log = {
  info: (obj: LogObj, event: string) => emit('info', obj, event),
  warn: (obj: LogObj, event: string) => emit('warn', obj, event),
  error: (obj: LogObj, event: string) => emit('error', obj, event),
}

export function maskBearer(authHeader: string | null | undefined): string {
  if (!authHeader) return ''
  const m = /^Bearer\s+(\S+)$/i.exec(authHeader)
  return m ? `Bearer ${m[1].slice(0, 8)}...` : '<malformed>'
}

export function maskToken(token: string | null | undefined): string {
  return token ? `${token.slice(0, 8)}...` : ''
}

export function maskSessionId(id: string | null | undefined): string {
  return id ? `${id.slice(0, 4)}...` : ''
}

export function maskCsrfToken(
  token: string | null | undefined,
): { present: boolean; length: number } {
  return { present: Boolean(token), length: token?.length ?? 0 }
}
