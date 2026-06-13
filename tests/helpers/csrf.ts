export function csrfHeader(token: string): HeadersInit {
  return { 'x-csrf-token': token, origin: 'http://localhost:3000' }
}
