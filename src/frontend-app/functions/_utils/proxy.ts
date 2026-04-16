const DEFAULT_BACKEND_ORIGIN = 'https://api.example.com'

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
])

export interface ProxyEnv {
  WENDAO_BACKEND_URL?: string
}

function normalizeOrigin(value?: string | null) {
  return (value?.trim() || DEFAULT_BACKEND_ORIGIN).replace(/\/$/, '')
}

function buildUpstreamHeaders(request: Request) {
  const headers = new Headers()

  for (const [key, value] of request.headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value)
    }
  }

  return headers
}

export async function proxyToBackend(request: Request, env: ProxyEnv) {
  const incomingUrl = new URL(request.url)
  const upstreamUrl = new URL(`${normalizeOrigin(env.WENDAO_BACKEND_URL)}${incomingUrl.pathname}${incomingUrl.search}`)
  const method = request.method.toUpperCase()

  const upstreamResponse = await fetch(upstreamUrl, {
    method,
    headers: buildUpstreamHeaders(request),
    body: method === 'GET' || method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  })

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: upstreamResponse.headers,
  })
}
