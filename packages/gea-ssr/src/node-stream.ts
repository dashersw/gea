// Node-side request/response helpers. Kept free of `@geajs/core` imports so the
// Vite plugin (which imports these) loads cleanly even when `@geajs/core` has not
// been built yet — fresh clones of the monorepo run e2e tests through this path.

export interface NodeResponseWriter {
  write(chunk: Uint8Array): boolean
  end(): void
  once(event: string, listener: () => void): void
  on(event: string, listener: () => void): void
  removeListener(event: string, listener: () => void): void
}

export function flattenHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of Object.keys(headers)) {
    const value = headers[key]
    if (typeof value === 'string') {
      result[key] = value
    } else if (Array.isArray(value)) {
      result[key] = value.join(', ')
    }
  }
  return result
}

export function copyHeadersToNodeResponse(
  from: Headers,
  to: { setHeader(name: string, value: string | string[]): void },
): void {
  const cookies = from.getSetCookie()
  from.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return
    to.setHeader(key, value)
  })
  if (cookies.length > 0) {
    to.setHeader('set-cookie', cookies)
  }
}

export async function pipeToNodeResponse(stream: ReadableStream<Uint8Array>, res: NodeResponseWriter): Promise<void> {
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
