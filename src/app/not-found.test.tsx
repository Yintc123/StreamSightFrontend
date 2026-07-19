import { describe, it, expect, vi } from 'vitest'

const redirectMock = vi.fn((path: string): never => {
  throw new Error(`REDIRECT:${path}`)
})
vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirectMock(path),
}))

import NotFound from './not-found'

describe('not-found', () => {
  it('redirects to /', () => {
    expect(() => NotFound()).toThrow(/REDIRECT/)
    expect(redirectMock).toHaveBeenCalledWith('/')
  })
})
