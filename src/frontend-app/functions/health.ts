import { proxyToBackend, type ProxyEnv } from './_utils/proxy'

export const onRequest = async (context: { request: Request; env: ProxyEnv }) => {
  return proxyToBackend(context.request, context.env)
}
