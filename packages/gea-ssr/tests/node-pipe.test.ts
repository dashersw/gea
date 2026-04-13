import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pipeToNodeResponse } from '../src/node.ts'
import { EventEmitter } from 'node:events'

function createMockResponse() {
  const emitter = new EventEmitter()
  const chunks: Buffer[] = []
  let ended = false

  // Use defineProperties so getters survive Object.assign
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
  })
  return res
}

describe('pipeToNodeResponse', () => {
  it('streams all chunks and ends response on normal completion', async () => {
    const res = createMockResponse()
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('hello'))
        controller.enqueue(encoder.encode(' world'))
        controller.close()
      },
    })

    await pipeToNodeResponse(stream, res)

    assert.equal(res.ended, true)
    const output = Buffer.concat(res.chunks).toString()
    assert.equal(output, 'hello world')
  })

  it('completes when client disconnects mid-stream', async () => {
    const res = createMockResponse()

    let controllerRef: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controllerRef = controller
      },
    })

    const pipePromise = pipeToNodeResponse(stream, res)

    controllerRef!.enqueue(new TextEncoder().encode('hello'))

    // Simulate client disconnect
    res.emit('close')

    // The pipe should resolve (not hang forever)
    await Promise.race([
      pipePromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('pipeToNodeResponse hung after client disconnect')), 2000),
      ),
    ])
  })

  it('stops writing after multiple chunks when client disconnects', async () => {
    const res = createMockResponse()

    let controllerRef: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controllerRef = controller
      },
    })

    const pipePromise = pipeToNodeResponse(stream, res)

    // Write first chunk
    controllerRef!.enqueue(new TextEncoder().encode('chunk1'))
    await new Promise((resolve) => setTimeout(resolve, 5))

    // Disconnect after first chunk
    res.emit('close')

    await Promise.race([pipePromise, new Promise((_, reject) => setTimeout(() => reject(new Error('hung')), 2000))])

    assert.equal(res.chunks.length, 1, 'only one chunk written before disconnect')
  })

  it('handles backpressure then disconnect without hanging', async () => {
    const emitter = new EventEmitter()
    const res = Object.assign(emitter, {
      write() {
        return false
      }, // Always backpressure
      end() {},
    })

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data'))
      },
    })

    const pipePromise = pipeToNodeResponse(stream, res)

    // Disconnect while waiting for drain
    await new Promise((resolve) => setTimeout(resolve, 5))
    res.emit('close')

    await Promise.race([
      pipePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('hung after backpressure disconnect')), 2000)),
    ])
  })
})
