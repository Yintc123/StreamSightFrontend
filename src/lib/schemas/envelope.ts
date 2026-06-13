import { z } from 'zod'

export const ErrorPayload = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
})

export function SuccessEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    data,
    meta: z.record(z.string(), z.unknown()).optional(),
  })
}

export const ErrorEnvelope = z.object({ error: ErrorPayload })
