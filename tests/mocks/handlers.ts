import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/api/charities', ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q') ?? ''
    const cursor = url.searchParams.get('cursor')

    return HttpResponse.json({
      items: [],
      nextCursor: null,
      meta: { q, cursor },
    })
  }),
]
