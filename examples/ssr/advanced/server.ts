import { handleRequest } from '../../../packages/gea-ssr/src/handle-request'
import { createSSRStream } from '../../../packages/gea-ssr/src/stream'
import { renderToString } from '../../../packages/gea-ssr/src/render'
import { parseShell } from '../../../packages/gea-ssr/src/shell'
import { escapeHtml } from '../../../packages/gea-ssr/src/head'
import App from './src/App'
import store from './src/store'
import HomePage from './src/pages/HomePage'
import HeadPage from './src/pages/HeadPage'
import DeferredPage from './src/pages/DeferredPage'
import ErrorRenderPage from './src/pages/ErrorRenderPage'
import MismatchPage from './src/pages/MismatchPage'

// Server-side side-channel for afterResponse hook verification
let lastAfterResponseRoute: string | null = null

const routes = {
  '/': HomePage,
  '/head': HeadPage,
  '/deferred': DeferredPage,
  '/error-render': ErrorRenderPage,
  '/error-data': HomePage, // Component doesn't matter — onBeforeRender throws before render
  '/mismatch': MismatchPage,
}

export default handleRequest(App, {
  routes,
  storeRegistry: { AdvancedStore: store },

  async onBeforeRender(context) {
    const pathname = new URL(context.request.url).pathname

    // Head management: set dynamic head tags for /head route
    if (pathname === '/head') {
      context.head = {
        title: 'Dynamic SSR Title',
        meta: [
          { name: 'description', content: 'Server-rendered meta description' },
          { property: 'og:title', content: 'OG Title from SSR' },
        ],
        link: [
          { rel: 'canonical', href: 'https://example.com/head' },
        ],
      }
    }

    // Error data: throw to test onError handler
    if (pathname === '/error-data') {
      throw new Error('Data loading failed')
    }
  },

  // Error boundary for render errors (component throws in template())
  onRenderError(error) {
    return `<div class="render-error"><h1>Render Error</h1><p class="error-message">${escapeHtml(error.message)}</p></div>`
  },

  // Error handler for data-loading / routing errors
  onError(error, _request) {
    const digest = String((error as Record<string, unknown>).digest || 'unknown')
    return new Response(
      `<html><body><div class="data-error"><h1>Data Error</h1><p class="error-message">${escapeHtml(error.message)}</p><p class="error-digest">${escapeHtml(digest)}</p></div></body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html' } },
    )
  },

  // After-response hook: records route to side-channel
  async afterResponse(context) {
    lastAfterResponseRoute = context.route
  },
})

// Custom handler for /deferred that uses createSSRStream with deferred chunks
export async function handleDeferredRequest(indexHtml: string): Promise<Response> {
  const appHtml = renderToString(DeferredPage)
  const shell = parseShell(indexHtml, 'app')

  const deferreds = [
    {
      id: 'deferred-fast',
      promise: new Promise<string>((resolve) =>
        setTimeout(() => resolve('<p class="resolved-fast">Fast data loaded!</p>'), 50),
      ),
    },
    {
      id: 'deferred-slow',
      promise: new Promise<string>((resolve) =>
        setTimeout(() => resolve('<p class="resolved-slow">Slow data loaded!</p>'), 200),
      ),
    },
    {
      id: 'deferred-fail',
      promise: new Promise<string>((_resolve, reject) =>
        setTimeout(() => reject(new Error('Deferred failed')), 100),
      ),
    },
  ]

  const stream = createSSRStream({
    shellBefore: shell.before,
    shellAfter: shell.after,
    headEnd: shell.headEnd,
    render: async () => ({ appHtml, stateJson: '{}' }),
    deferreds,
  })

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

// Expose side-channel for test verification
export { lastAfterResponseRoute }
