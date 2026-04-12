import { createServerRouter } from './server-router'
import { renderToString } from './render'
import { serializeStores } from './serialize'
import { runInSSRContext } from './ssr-context'
import { parseShell } from './shell'
import { createSSRStream } from './stream'
import { serializeHead } from './head'
import type { GeaComponentConstructor, StoreRegistry, SSRContext, RouteMap } from './types'
import { Router } from '@geajs/core/router'
import { resolveSSRRouter, runWithSSRRouter, createSSRRouterState } from './ssr-router-context'

// Wire the SSR router resolver into the Router singleton proxy
if (!Router._ssrRouterResolver) {
  Router._ssrRouterResolver = resolveSSRRouter
}

function generateDigest(error: Error): string {
  let hash = 0
  const str = error.message || 'unknown'
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return 'gea-' + (hash >>> 0).toString(36)
}

export interface SSROptions {
  routes?: RouteMap
  indexHtml?: string
  storeRegistry?: StoreRegistry
  onBeforeRender?: (context: SSRContext) => Promise<void> | void
  onError?: (error: Error, request: Request) => Response | Promise<Response>
  afterResponse?: (context: SSRContext) => Promise<void> | void
  shell?: { appElementId?: string }
  onRenderError?: (error: Error) => string
}

export function handleRequest(
  App: GeaComponentConstructor,
  options: SSROptions = {},
): (request: Request, context?: { indexHtml?: string }) => Promise<Response> {
  const appElementId = options.shell?.appElementId ?? 'app'

  return async (request: Request, context?: { indexHtml?: string }): Promise<Response> => {
    const stores = options.storeRegistry ? Object.values(options.storeRegistry) : []

    return runInSSRContext(stores, async () => {
      try {
        // 1. Resolve route
        const url = request.url
        const parsedUrl = new URL(url)
        const emptyParams: Record<string, string> = {}
        const fallbackQuery: Record<string, string | string[]> = {}
        for (const [key, value] of parsedUrl.searchParams) {
          const current = fallbackQuery[key]
          fallbackQuery[key] =
            current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value]
        }
        const emptyMatches: string[] = []
        const routeResult = options.routes
          ? createServerRouter(url, options.routes, true)
          : {
              path: parsedUrl.pathname,
              route: parsedUrl.pathname,
              params: emptyParams,
              query: fallbackQuery,
              hash: parsedUrl.hash,
              matches: emptyMatches,
              component: null,
              guardRedirect: null,
              isNotFound: false,
            }

        const ssrRouterState = createSSRRouterState(routeResult)

        return await runWithSSRRouter(ssrRouterState, async () => {
          // 2. Handle guard redirects
          if (routeResult.guardRedirect) {
            return new Response(null, {
              status: 302,
              headers: { Location: routeResult.guardRedirect },
            })
          }

          // 3. Data loading — runs BEFORE streaming so errors produce clean error responses
          const ssrCtx: SSRContext = {
            request,
            params: routeResult.params,
            query: routeResult.query,
            hash: routeResult.hash,
            route: routeResult.route,
            head: {},
          }
          if (options.onBeforeRender) {
            await options.onBeforeRender(ssrCtx)
          }

          // 4. Render — synchronous after data loading
          const ssrProps: Record<string, unknown> = {}
          if (routeResult.component) {
            ssrProps.__ssrRouteComponent = routeResult.component
            ssrProps.__ssrRouteProps = { ...routeResult.params }
          }
          const appHtml = renderToString(App, ssrProps, {
            onRenderError: options.onRenderError,
          })

          // 5. Serialize state
          const stateJson = stores.length > 0 ? serializeStores(stores, options.storeRegistry!) : '{}'

          // 6. Parse shell and stream
          const indexHtml =
            context?.indexHtml ??
            options.indexHtml ??
            `<!DOCTYPE html><html><head></head><body><div id="${appElementId}"></div></body></html>`
          const shellParts = parseShell(indexHtml, appElementId)

          let stream: ReadableStream<Uint8Array> = createSSRStream({
            shellBefore: shellParts.before,
            shellAfter: shellParts.after,
            headHtml: serializeHead(ssrCtx.head ?? {}),
            headEnd: shellParts.headEnd,
            render: async () => ({ appHtml, stateJson }),
            deferreds: ssrCtx.deferreds,
          })

          // 7. afterResponse hook — wrap stream to trigger callback on completion
          if (options.afterResponse) {
            const afterFn = options.afterResponse
            const passthrough = new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, controller) {
                controller.enqueue(chunk)
              },
              flush() {
                return Promise.resolve(afterFn(ssrCtx)).catch((e: unknown) => {
                  console.error('[gea-ssr] afterResponse error:', e)
                })
              },
            })
            stream = stream.pipeThrough(passthrough)
          }

          const status = routeResult.isNotFound ? 404 : 200
          return new Response(stream, {
            status,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        })
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        if (!('digest' in err)) {
          Object.defineProperty(err, 'digest', {
            value: generateDigest(err),
            writable: true,
            configurable: true,
          })
        }
        console.error('[gea-ssr] Render error:', err)
        if (options.onError) {
          try {
            return await options.onError(err, request)
          } catch (secondaryError) {
            console.error('onError handler failed:', secondaryError)
            return new Response('Internal Server Error', { status: 500 })
          }
        }
        return new Response('Internal Server Error', { status: 500 })
      }
    })
  }
}
