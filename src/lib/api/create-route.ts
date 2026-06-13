import 'server-only'
import type { ZodType } from 'zod'
import type { StoredSession } from '@/lib/session/types'
import { getSessionService } from '@/lib/session/service'
import { verifyCsrf } from '@/lib/security/verifyCsrf'
import { UnauthenticatedError } from '@/lib/errors/UnauthenticatedError'
import { toErrorResponse } from '@/lib/errors/toErrorResponse'
import { log } from '@/lib/log'
import { newRequestId } from './request-id'
import { parseBody, parseQuery, parsePathParams } from './parsers'

type RouteHandlerArgs<TBody, TQuery, TParams, TAuth extends boolean> = {
  req: Request
  requestId: string
  body: TBody
  query: TQuery
  params: TParams
  session: TAuth extends true ? StoredSession : StoredSession | null
}

type RouteOptions<TBody, TQuery, TParams, TAuth extends boolean> = {
  requireAuth?: TAuth
  bodySchema?: ZodType<TBody>
  querySchema?: ZodType<TQuery>
  paramsSchema?: ZodType<TParams>
  csrfExempt?: boolean
  handler: (
    args: RouteHandlerArgs<TBody, TQuery, TParams, TAuth>,
  ) => Promise<Response> | Response
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function createRoute<
  TBody = undefined,
  TQuery = undefined,
  TParams = undefined,
  TAuth extends boolean = false,
>(
  opts: RouteOptions<TBody, TQuery, TParams, TAuth>,
): (
  req: Request,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response> {
  return async (req, ctx) => {
    const requestId = newRequestId()
    const start = Date.now()
    log.info(
      { requestId, path: new URL(req.url).pathname, method: req.method },
      'bff.request.in',
    )

    try {
      // step 2: params parse
      let params = undefined as TParams
      if (opts.paramsSchema) {
        const rawParams = await ctx.params
        params = parsePathParams(rawParams, opts.paramsSchema)
      }

      // step 3: query parse
      let query = undefined as TQuery
      if (opts.querySchema) {
        query = parseQuery(req, opts.querySchema)
      }

      // step 4: session read (the ONE call per request)
      const session = await getSessionService().get()

      // step 5: auth gate
      if (opts.requireAuth && !session) {
        throw new UnauthenticatedError('Authentication required')
      }

      // step 6: CSRF (verifyCsrf itself short-circuits safe methods)
      if (!SAFE_METHODS.has(req.method)) {
        verifyCsrf(req, session, { exempt: opts.csrfExempt })
      }

      // step 7: body parse
      let body = undefined as TBody
      if (opts.bodySchema) {
        body = await parseBody(req, opts.bodySchema)
      }

      // step 8: invoke handler
      const handlerResponse = await Promise.resolve(
        opts.handler({
          req,
          requestId,
          body,
          query,
          params,
          session: session as TAuth extends true ? StoredSession : StoredSession | null,
        }),
      )

      // step 9: enforce Cache-Control no-store (overwrites any handler value)
      const response = applyNoStore(handlerResponse)

      // step 10: touch unless handler-side mutation already slid TTL
      if (session && !getSessionService().wasMutated()) {
        await getSessionService().touch()
      }

      // step 11
      log.info(
        { requestId, status: response.status, durationMs: Date.now() - start },
        'bff.response.out',
      )
      return response
    } catch (err) {
      // Spec 001f §5.5 — anything escaping handler is a route-level / internal
      // failure. Upstream-specific errors get logged separately in backendFetch
      // with bff.upstream.error.
      log.warn(
        { requestId, durationMs: Date.now() - start, err: errMessage(err) },
        'bff.internal.error',
      )
      return toErrorResponse(err, requestId)
    }
  }
}

function applyNoStore(res: Response): Response {
  if (res.headers.get('cache-control') === 'no-store, private') return res
  const headers = new Headers(res.headers)
  headers.set('cache-control', 'no-store, private')
  // Transfer the body stream into a new Response rather than buffering via
  // res.text(). Lets future streamed handlers (e.g. CSV download) survive
  // without an in-memory copy.
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
