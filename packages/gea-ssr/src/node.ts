import { handleRequest } from './handle-request'
import type { SSROptions } from './handle-request'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { GeaComponentConstructor } from './types'
import { flattenHeaders, copyHeadersToNodeResponse, pipeToNodeResponse } from './node-stream'

export { pipeToNodeResponse }

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
