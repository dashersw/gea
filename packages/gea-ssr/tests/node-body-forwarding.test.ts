import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { EventEmitter } from 'node:events'
import type { IncomingMessage } from 'node:http'
import { Component, GEA_CREATE_TEMPLATE } from '@geajs/core'
import { createNodeHandler } from '../src/node.ts'

const mockIndexHtml = '<!DOCTYPE html><html><body><div id="app"></div></body></html>'

class TestApp extends Component {
  [GEA_CREATE_TEMPLATE](): Node {
    const h = document.createElement('h1')
    h.textContent = 'Test'
    return h
  }
}

function createMockIncomingMessage(
  method: string,
  url: string,
  headers: Record<string, string>,
  bodyContent?: string,
): IncomingMessage {
  let sent = false
  const readable = new Readable({
    read() {
      if (bodyContent && !sent) {
        sent = true
        this.push(Buffer.from(bodyContent))
      } else {
        this.push(null)
      }
    },
  })
  Object.assign(readable, {
    method,
    url,
    headers,
    socket: {},
  })
  return readable as unknown as IncomingMessage
}

function createMockServerResponse() {
  const emitter = new EventEmitter()
  const chunks: Buffer[] = []
  const res = Object.assign(emitter, {
    statusCode: 0,
    write(chunk: Uint8Array) {
      chunks.push(Buffer.from(chunk))
      return true
    },
    end() {},
    setHeader(_key: string, _value: string | string[]) {},
  })
  Object.defineProperty(res, 'body', {
    get() {
      return Buffer.concat(chunks).toString()
    },
  })
  return res
}

describe('Node adapter body forwarding', () => {
  it('POST request produces valid response through real adapter', async () => {
    const handler = createNodeHandler(TestApp, { indexHtml: mockIndexHtml })

    const payload = JSON.stringify({ name: 'test' })
    const req = createMockIncomingMessage(
      'POST',
      '/',
      {
        host: 'localhost',
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(payload)),
      },
      payload,
    )
    const res = createMockServerResponse()

    await handler(req, res)

    assert.equal(res.statusCode, 200)
    assert.ok(res.body.includes('<h1>Test</h1>'))
  })

  it('GET request works without body through real adapter', async () => {
    const handler = createNodeHandler(TestApp, { indexHtml: mockIndexHtml })
    const req = createMockIncomingMessage('GET', '/', { host: 'localhost' })
    const res = createMockServerResponse()

    await handler(req, res)

    assert.equal(res.statusCode, 200)
    assert.ok(res.body.includes('<h1>Test</h1>'))
  })
})
