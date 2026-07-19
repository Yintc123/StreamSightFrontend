// Spec 010 §3.3 / §6.2a — surfaces a toast on the homepage when an auth
// gate redirect lands with `?reason=cms-auth`.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  pushMock: vi.fn(),
  searchParamsMock: { get: vi.fn<(key: string) => string | null>() },
  toastErrorMock: vi.fn(),
}))
const { replaceMock, pushMock, searchParamsMock, toastErrorMock } = mocks

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.pushMock, replace: mocks.replaceMock }),
  useSearchParams: () => mocks.searchParamsMock,
}))

vi.mock('sonner', () => ({
  toast: { error: mocks.toastErrorMock, success: vi.fn(), dismiss: vi.fn() },
}))

import {
  AuthRedirectToast,
  CMS_AUTH_TOAST_ID,
  CMS_AUTH_TOAST_MESSAGE,
  CMS_NOT_ADMIN_TOAST_ID,
  CMS_NOT_ADMIN_TOAST_MESSAGE,
  IDLE_LOGOUT_TOAST_ID,
  IDLE_LOGOUT_TOAST_MESSAGE,
} from './AuthRedirectToast'

beforeEach(() => {
  replaceMock.mockReset()
  pushMock.mockReset()
  toastErrorMock.mockReset()
  searchParamsMock.get.mockReset()
})

describe('<AuthRedirectToast />', () => {
  it('fires toast.error + router.replace("/") when reason=cms-auth', () => {
    searchParamsMock.get.mockImplementation((k) =>
      k === 'reason' ? 'cms-auth' : null,
    )
    render(<AuthRedirectToast />)
    expect(toastErrorMock).toHaveBeenCalledWith(
      CMS_AUTH_TOAST_MESSAGE,
      expect.objectContaining({ id: CMS_AUTH_TOAST_ID }),
    )
    expect(replaceMock).toHaveBeenCalledWith('/')
  })

  it('does nothing when reason is missing', () => {
    searchParamsMock.get.mockReturnValue(null)
    render(<AuthRedirectToast />)
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('does nothing when reason is some other value', () => {
    searchParamsMock.get.mockImplementation((k) =>
      k === 'reason' ? 'other-cause' : null,
    )
    render(<AuthRedirectToast />)
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('renders nothing visible to the DOM', () => {
    searchParamsMock.get.mockReturnValue(null)
    const { container } = render(<AuthRedirectToast />)
    expect(container.firstChild).toBeNull()
  })

  it('(spec 011 §3.5) fires toast.error 「需要管理員權限」 when reason=cms-not-admin', () => {
    searchParamsMock.get.mockImplementation((k) =>
      k === 'reason' ? 'cms-not-admin' : null,
    )
    render(<AuthRedirectToast />)
    expect(toastErrorMock).toHaveBeenCalledWith(
      CMS_NOT_ADMIN_TOAST_MESSAGE,
      expect.objectContaining({ id: CMS_NOT_ADMIN_TOAST_ID }),
    )
    expect(replaceMock).toHaveBeenCalledWith('/')
  })

  it('(spec 018) fires toast.error 「閒置過久」 when reason=idle-logout', () => {
    searchParamsMock.get.mockImplementation((k) =>
      k === 'reason' ? 'idle-logout' : null,
    )
    render(<AuthRedirectToast />)
    expect(toastErrorMock).toHaveBeenCalledWith(
      IDLE_LOGOUT_TOAST_MESSAGE,
      expect.objectContaining({ id: IDLE_LOGOUT_TOAST_ID }),
    )
    expect(replaceMock).toHaveBeenCalledWith('/')
  })
})
