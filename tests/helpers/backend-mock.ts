import { http, type HttpHandler } from 'msw'
import { server } from '../mocks/server'

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'
type Handler = (req: Request) => Response | Promise<Response>

export function mockBackend(method: Method, url: string, handler: Handler): HttpHandler {
  const h = http[method](url, async ({ request }) => handler(request))
  server.use(h)
  return h
}
