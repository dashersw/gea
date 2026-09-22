import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { installDom, flushMicrotasks } from '../helpers/jsdom-setup'
import {
  buildEvalPrelude,
  mergeEvalBindings,
  loadRuntimeModules,
} from '../../packages/vite-plugin-gea/tests/helpers/compile'
import { geaPlugin } from '../../packages/vite-plugin-gea/src/index'

const EXAMPLE_DIR = resolve(import.meta.dirname, '../../examples/tic-tac-toe/src')

function readSource(name: string) {
  return readFileSync(resolve(EXAMPLE_DIR, name), 'utf-8')
}

async function compileSource(source: string, id: string, exportName: string, bindings: Record<string, unknown>) {
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  const result = await transform?.call({} as never, source, id)

  let code: string
  if (result) {
    code = typeof result === 'string' ? result : result.code
  } else {
    code = source
  }

  const esbuild = await import('esbuild')
  const stripped = await esbuild.transform(code, { loader: 'ts', target: 'esnext' })
  code = stripped.code

  bindings = mergeEvalBindings(bindings)
  const compiledSource = `${buildEvalPrelude()}${code
    .replace(/^import .*;$/gm, '')
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replaceAll('import.meta.hot', 'undefined')
    .replaceAll('import.meta.url', '""')
    .replace(/export default class\s+/, 'class ')
    .replace(/export default function\s+/, 'function ')
    .replace(/export default new\s+(\w+)\(\)/, 'return new $1()')
    .replace(/export\s*\{[^}]*\}/, '')}
return ${exportName};`

  return new Function(...Object.keys(bindings), compiledSource)(...Object.values(bindings))
}

function mountApp(App: any) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new App()
  app.render(root)
  return { root, app }
}

async function buildTicTacToe(seed: string) {
  const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

  const gameStore = await compileSource(readSource('game-store.ts'), resolve(EXAMPLE_DIR, 'game-store.ts'), 'store', {
    Store,
  })

  const Cell = await compileSource(readSource('cell.tsx'), resolve(EXAMPLE_DIR, 'cell.tsx'), 'Cell', { Component })

  const Scoreboard = await compileSource(
    readSource('scoreboard.tsx'),
    resolve(EXAMPLE_DIR, 'scoreboard.tsx'),
    'Scoreboard',
    { Component },
  )

  const Board = await compileSource(readSource('board.tsx'), resolve(EXAMPLE_DIR, 'board.tsx'), 'Board', {
    Component,
    gameStore,
    Cell,
  })

  const App = await compileSource(readSource('app.tsx'), resolve(EXAMPLE_DIR, 'app.tsx'), 'App', {
    Component,
    gameStore,
    Board,
    Scoreboard,
  })

  return { Component, Store, gameStore, Cell, Scoreboard, Board, App }
}

describe('Tic Tac Toe', () => {
  let restoreDom: () => void
  let gameStore: any
  let App: any

  beforeEach(async () => {
    restoreDom = installDom()
    const seed = `tictactoe-${Date.now()}-${Math.random()}`
    const built = await buildTicTacToe(seed)
    gameStore = built.gameStore
    App = built.App
  })

  afterEach(() => {
    restoreDom()
  })

  describe('initial render', () => {
    it('renders 9 cells', async () => {
      const { root, app } = mountApp(App)
      const cells = root.querySelectorAll('.cell')
      assert.equal(cells.length, 9)
      app.dispose()
    })

    it('all cells are empty and playable', async () => {
      const { root, app } = mountApp(App)
      const cells = root.querySelectorAll('.cell')
      for (const cell of cells) {
        assert.ok(cell.classList.contains('cell-playable'), 'cell should be playable')
        assert.ok(!cell.classList.contains('cell-x'), 'cell should not have X')
        assert.ok(!cell.classList.contains('cell-o'), 'cell should not have O')
      }
      app.dispose()
    })

    it('shows X turn status', async () => {
      const { root, app } = mountApp(App)
      const status = root.querySelector('.status')
      assert.equal(status?.textContent, "X's turn")
      app.dispose()
    })

    it('shows initial scores of 0', async () => {
      const { root, app } = mountApp(App)
      const scoreValues = root.querySelectorAll('.score-value')
      assert.equal(scoreValues.length, 3)
      for (const sv of scoreValues) {
        assert.equal(sv.textContent, '0')
      }
      app.dispose()
    })
  })

  describe('making moves', () => {
    it('places X on first move and switches to O turn', async () => {
      const { root, app } = mountApp(App)

      gameStore.makeMove(0)
      await flushMicrotasks()

      const cells = root.querySelectorAll('.cell')
      assert.equal(cells[0].textContent, 'X')
      assert.ok(cells[0].classList.contains('cell-x'))
      assert.ok(!cells[0].classList.contains('cell-playable'))

      const status = root.querySelector('.status')
      assert.equal(status?.textContent, "O's turn")

      app.dispose()
    })

    it('alternates between X and O', async () => {
      const { root, app } = mountApp(App)

      gameStore.makeMove(0)
      gameStore.makeMove(1)
      await flushMicrotasks()

      const cells = root.querySelectorAll('.cell')
      assert.equal(cells[0].textContent, 'X')
      assert.equal(cells[1].textContent, 'O')
      assert.ok(cells[0].classList.contains('cell-x'))
      assert.ok(cells[1].classList.contains('cell-o'))

      app.dispose()
    })

    it('ignores moves on occupied cells', async () => {
      const { root, app } = mountApp(App)

      gameStore.makeMove(0) // X
      gameStore.makeMove(0) // should be ignored
      await flushMicrotasks()

      assert.equal(gameStore.currentPlayer, 'O')
      const cells = root.querySelectorAll('.cell')
      assert.equal(cells[0].textContent, 'X')

      app.dispose()
    })
  })

  describe('winning', () => {
    it('detects X win on top row', async () => {
      const { root, app } = mountApp(App)

      gameStore.makeMove(0) // X
      gameStore.makeMove(3) // O
      gameStore.makeMove(1) // X
      gameStore.makeMove(4) // O
      gameStore.makeMove(2) // X wins
      await flushMicrotasks()

      const status = root.querySelector('.status')
      assert.equal(status?.textContent, 'X wins!')
      assert.ok(status?.classList.contains('status-end'))

      // Winning cells should be marked
      const cells = root.querySelectorAll('.cell')
      assert.ok(cells[0].classList.contains('cell-winning'))
      assert.ok(cells[1].classList.contains('cell-winning'))
      assert.ok(cells[2].classList.contains('cell-winning'))
      assert.ok(!cells[3].classList.contains('cell-winning'))

      // Score should update
      const scoreValues = root.querySelectorAll('.score-value')
      assert.equal(scoreValues[0].textContent, '1') // X score

      app.dispose()
    })

    it('detects a draw', async () => {
      const { root, app } = mountApp(App)

      // X O X
      // X X O
      // O X O
      gameStore.makeMove(0) // X
      gameStore.makeMove(1) // O
      gameStore.makeMove(2) // X
      gameStore.makeMove(5) // O
      gameStore.makeMove(3) // X
      gameStore.makeMove(6) // O
      gameStore.makeMove(4) // X
      gameStore.makeMove(8) // O
      gameStore.makeMove(7) // X - draw
      await flushMicrotasks()

      const status = root.querySelector('.status')
      assert.equal(status?.textContent, "It's a draw!")

      app.dispose()
    })

    it('shows play again button after game over', async () => {
      const { root, app } = mountApp(App)

      // Quick win for X
      gameStore.makeMove(0) // X
      gameStore.makeMove(3) // O
      gameStore.makeMove(1) // X
      gameStore.makeMove(4) // O
      gameStore.makeMove(2) // X wins
      await flushMicrotasks()

      const resetBtn = root.querySelector('.btn-reset')
      assert.ok(resetBtn, 'play again button should be visible')
      assert.equal(resetBtn?.textContent, 'Play again')

      app.dispose()
    })
  })

  describe('reset', () => {
    it('resets the board after a win', async () => {
      const { root, app } = mountApp(App)

      gameStore.makeMove(0) // X
      gameStore.makeMove(3) // O
      gameStore.makeMove(1) // X
      gameStore.makeMove(4) // O
      gameStore.makeMove(2) // X wins
      await flushMicrotasks()

      gameStore.reset()
      await flushMicrotasks()

      const cells = root.querySelectorAll('.cell')
      for (const cell of cells) {
        assert.ok(cell.classList.contains('cell-playable'), 'cells should be playable after reset')
        assert.ok(!cell.classList.contains('cell-winning'), 'no winning cells after reset')
      }

      const status = root.querySelector('.status')
      assert.equal(status?.textContent, "X's turn")

      // Score should be preserved
      const scoreValues = root.querySelectorAll('.score-value')
      assert.equal(scoreValues[0].textContent, '1') // X score persists

      app.dispose()
    })
  })
})
