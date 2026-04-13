import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { pipeToNodeResponse } from '../src/node.ts'
import { copyHeadersToNodeResponse } from '../src/types.ts'

function createMockRes() {
  const emitter = new EventEmitter()
  const chunks: Buffer[] = []
  let ended = false
  const res = Object.assign(emitter, {
    write(chunk: Uint8Array) {
      chunks.push(Buffer.from(chunk))
      return true
    },
    end() {
      ended = true
    },
  })
  Object.defineProperties(res, {
    chunks: {
      get() {
        return chunks
      },
    },
    ended: {
      get() {
        return ended
      },
    },
    body: {
      get() {
        return Buffer.concat(chunks).toString()
      },
    },
  })
  return res
}

describe('pipeToNodeResponse', () => {
  it('pipes ReadableStream to Node response', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('Hello '))
        controller.enqueue(encoder.encode('World'))
        controller.close()
      },
    })
    const res = createMockRes()
    await pipeToNodeResponse(stream, res)
    assert.equal(res.body, 'Hello World')
    assert.ok(res.ended)
  })

  it('respects backpressure when write returns false', async () => {
    const chunks: Uint8Array[] = []
    let drainCallback: (() => void) | null = null
    let writeCallCount = 0

    const emitter = new EventEmitter()
    const res = Object.assign(emitter, {
      write(chunk: Uint8Array): boolean {
        chunks.push(chunk)
        writeCallCount++
        // Simulate backpressure on first write
        if (writeCallCount === 1) return false
        return true
      },
      end() {},
    })
    // Override once to capture drain callback and trigger it
    const origOnce = res.once.bind(res)
    res.once = function (event: string, cb: (...args: unknown[]) => void) {
      if (event === 'drain') {
        drainCallback = cb
        queueMicrotask(() => cb())
      }
      return origOnce(event, cb)
    }

    const data = new TextEncoder().encode('hello')
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(data)
        controller.enqueue(data)
        controller.close()
      },
    })

    await pipeToNodeResponse(stream, res)
    assert.strictEqual(chunks.length, 2)
    assert.ok(drainCallback !== null, 'drain listener was registered')
  })

  it('handles empty stream', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.close()
      },
    })
    const res = createMockRes()
    await pipeToNodeResponse(stream, res)
    assert.equal(res.body, '')
    assert.ok(res.ended)
  })
})

describe('copyHeadersToNodeResponse', () => {
  it('preserves multiple Set-Cookie headers as array', () => {
    const headers = new Headers()
    headers.append('Set-Cookie', 'session=abc; Path=/')
    headers.append('Set-Cookie', 'theme=dark; Path=/')
    headers.append('Content-Type', 'text/html')

    const stored: Record<string, string | string[]> = {}
    const mockRes = {
      setHeader(key: string, value: string | string[]) {
        stored[key] = value
      },
    }

    copyHeadersToNodeResponse(headers, mockRes)

    assert.deepEqual(stored['set-cookie'], ['session=abc; Path=/', 'theme=dark; Path=/'])
    assert.equal(stored['content-type'], 'text/html')
  })

  it('handles single Set-Cookie header', () => {
    const headers = new Headers()
    headers.append('Set-Cookie', 'session=abc; Path=/')

    const stored: Record<string, string | string[]> = {}
    const mockRes = {
      setHeader(key: string, value: string | string[]) {
        stored[key] = value
      },
    }

    copyHeadersToNodeResponse(headers, mockRes)

    assert.deepEqual(stored['set-cookie'], ['session=abc; Path=/'])
  })

  it('works with no Set-Cookie headers', () => {
    const headers = new Headers()
    headers.set('Content-Type', 'text/html')

    const stored: Record<string, string | string[]> = {}
    const mockRes = {
      setHeader(key: string, value: string | string[]) {
        stored[key] = value
      },
    }

    copyHeadersToNodeResponse(headers, mockRes)

    assert.equal(stored['content-type'], 'text/html')
    assert.equal(stored['set-cookie'], undefined)
  })
})
