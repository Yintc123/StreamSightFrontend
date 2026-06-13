import { z } from 'zod'

export const CursorPage = z.object({
  items: z.array(z.unknown()),
  nextCursor: z.string().nullable(),
})
