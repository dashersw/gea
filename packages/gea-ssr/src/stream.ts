export interface DeferredChunk {
  id: string
  promise: Promise<string>
}

export interface SSRStreamOptions {
  shellBefore: string
  shellAfter: string
  headHtml?: string
  headEnd?: number
  render: () => Promise<{ appHtml: string; stateJson: string }>
  deferreds?: DeferredChunk[]
  streamTimeout?: number
  nonce?: string
}

const encoder = new TextEncoder()

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildReplacementScript(id: string, html: string, nonceAttr: string): string {
  const escapedId = JSON.stringify(id)
  const escapedHtml = JSON.stringify(html)
  return (
    `<script${nonceAttr}>(function(){` +
    `var e=document.getElementById(${escapedId});` +
    `if(e){var t=document.createElement("template");` +
    `t.innerHTML=${escapedHtml};` +
    `e.replaceWith(t.content)}` +
    `})()</script>`
  )
}

export function createSSRStream(options: SSRStreamOptions): ReadableStream<Uint8Array> {
  const { shellBefore, shellAfter, headHtml, headEnd, render, deferreds } = options
  const timeout = options.streamTimeout ?? 10_000
  const nonceAttr = options.nonce ? ` nonce="${escapeAttr(options.nonce)}"` : ''

  const shellAfterBytes = encoder.encode(shellAfter)

  return new ReadableStream({
    async start(controller) {
      // Chunk 1: shell with optional head injection — flushed immediately
      if (headHtml && headEnd !== undefined && headEnd >= 0) {
        const beforeHead = shellBefore.substring(0, headEnd)
        const afterHead = shellBefore.substring(headEnd)
        controller.enqueue(encoder.encode(beforeHead + headHtml + afterHead))
      } else {
        controller.enqueue(encoder.encode(shellBefore))
      }

      try {
        const { appHtml, stateJson } = await render()

        // Chunk 2: rendered app HTML
        controller.enqueue(encoder.encode(appHtml))

        // Chunk 3: serialized state + closing tags
        if (stateJson !== '{}') {
          const stateBytes = encoder.encode(`<script${nonceAttr}>window.__GEA_STATE__=${stateJson}</script>`)
          const combined = new Uint8Array(stateBytes.length + shellAfterBytes.length)
          combined.set(stateBytes, 0)
          combined.set(shellAfterBytes, stateBytes.length)
          controller.enqueue(combined)
        } else {
          controller.enqueue(shellAfterBytes)
        }

        // Stream deferred content resolutions individually
        if (deferreds && deferreds.length > 0) {
          await Promise.all(
            deferreds.map(async (d) => {
              let timer: ReturnType<typeof setTimeout> | undefined
              try {
                const html = await Promise.race([
                  d.promise,
                  new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error('Deferred timed out')), timeout)
                  }),
                ])
                clearTimeout(timer)
                controller.enqueue(encoder.encode(buildReplacementScript(d.id, html, nonceAttr)))
              } catch {
                clearTimeout(timer)
                // Timeout or error: fallback HTML remains in place
              }
            }),
          )
        }
      } catch (error) {
        controller.error(error)
        return
      }

      controller.close()
    },
  })
}
