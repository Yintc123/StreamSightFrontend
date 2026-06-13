import 'server-only'
import type { ZodType, ZodError } from 'zod'
import { ValidationError } from '@/lib/errors/ValidationError'
import { PayloadTooLargeError } from '@/lib/errors/PayloadTooLargeError'
import { MAX_BODY_BYTES } from './constants'

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const len = req.headers.get('content-length')
  if (len && Number(len) > MAX_BODY_BYTES) {
    throw new PayloadTooLargeError(
      `Body exceeds ${MAX_BODY_BYTES} bytes (content-length)`,
    )
  }
  if (!req.body) {
    const result = schema.safeParse(undefined)
    if (!result.success) throw new ValidationError(formatZod(result.error))
    return result.data
  }

  const reader = req.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let text = ''
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        text += decoder.decode()
        break
      }
      total += value.byteLength
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {})
        throw new PayloadTooLargeError(
          `Body exceeds ${MAX_BODY_BYTES} bytes (streamed)`,
        )
      }
      text += decoder.decode(value, { stream: true })
    }
  } catch (e) {
    if (e instanceof PayloadTooLargeError) throw e
    throw new ValidationError('Body is not valid UTF-8', e)
  }

  let raw: unknown
  try {
    raw = text.length ? JSON.parse(text) : undefined
  } catch (e) {
    throw new ValidationError('Body is not valid JSON', e)
  }
  const result = schema.safeParse(raw)
  if (!result.success) throw new ValidationError(formatZod(result.error))
  return result.data
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const raw = Object.fromEntries(new URL(req.url).searchParams)
  const result = schema.safeParse(raw)
  if (!result.success) throw new ValidationError(formatZod(result.error))
  return result.data
}

export function parsePathParams<T>(raw: Record<string, string>, schema: ZodType<T>): T {
  const result = schema.safeParse(raw)
  if (!result.success) throw new ValidationError(formatZod(result.error))
  return result.data
}

function formatZod(err: ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
}
