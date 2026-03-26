import { handleRequest } from './handle-request'
import type { SSROptions } from './handle-request'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { GeaComponentConstructor, NodeResponseWriter } from './types'
import { flattenHeaders, copyHeadersToNodeResponse } from './types'

export async function pipeToNodeResponse(
  stream: ReadableStream<Uint8Array>,
  res: NodeResponseWriter,
): Promise<void> {
  const reader = stream.getReader()
  let cancelled = false

  const onClose = () => {
    cancelled = true
    reader.cancel().catch(() => {})
  }
  res.on('close', onClose)

  try {
    while (!cancelled) {
      const { done, value } = await reader.read()
      if (done || cancelled) break
      const ok = res.write(value)
      if (!ok && !cancelled) {
        await new Promise<void>((resolve) => {
          const onDrain = () => {
            res.removeListener('close', onCloseWhileDraining)
            resolve()
          }
          const onCloseWhileDraining = () => {
            res.removeListener('drain', onDrain)
            resolve()
          }
          res.once('drain', onDrain)
          res.once('close', onCloseWhileDraining)
        })
      }
    }
  } finally {
    res.removeListener('close', onClose)
    reader.releaseLock()
    if (!cancelled) res.end()
  }
}

export function createNodeHandler(
  App: GeaComponentConstructor,
  options: SSROptions = {},
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const handler = handleRequest(App, options)

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const protocol = 'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http'
    const host = req.headers.host ?? 'localhost'
    const url = `${protocol}://${host}${req.url ?? '/'}`

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'

    let body: ReadableStream<Uint8Array> | null = null
    if (hasBody) {
      body = new ReadableStream({
        start(controller) {
          req.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
          req.on('end', () => controller.close())
          req.on('error', (err: Error) => controller.error(err))
        },
      })
    }

    const request = new Request(url, {
      method: req.method,
      headers: flattenHeaders(req.headers),
      ...(body ? { body, duplex: 'half' as const } : {}),
    })

    const response = await handler(request)

    res.statusCode = response.status
    copyHeadersToNodeResponse(response.headers, res)

    if (response.body) {
      await pipeToNodeResponse(response.body, res)
    } else {
      res.end()
    }
  }
}
