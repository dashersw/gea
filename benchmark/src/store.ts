import { Store } from 'gea'

const random = (max) => Math.round(Math.random() * 1000) % max

const A = [
  'pretty',
  'large',
  'big',
  'small',
  'tall',
  'short',
  'long',
  'handsome',
  'plain',
  'quaint',
  'clean',
  'elegant',
  'easy',
  'angry',
  'crazy',
  'helpful',
  'mushy',
  'odd',
  'unsightly',
  'adorable',
  'important',
  'inexpensive',
  'cheap',
  'expensive',
  'fancy',
]
const C = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown', 'white', 'black', 'orange']
const N = [
  'table',
  'chair',
  'house',
  'bbq',
  'desk',
  'car',
  'pony',
  'cookie',
  'sandwich',
  'burger',
  'pizza',
  'mouse',
  'keyboard',
]

let nextId = 1

function buildData(count) {
  return Array.from({ length: count }, () => ({
    id: nextId++,
    label: `${A[random(A.length)]} ${C[random(C.length)]} ${N[random(N.length)]}`,
  }))
}

class BenchmarkStore extends Store {
  data: Array<{ id: number; label: string }> = []
  selected: number = 0

  run() {
    this.data = buildData(1000)
    this.selected = 0
  }
  runLots() {
    this.data = buildData(10000)
    this.selected = 0
  }
  add() {
    this.data.push(...buildData(1000))
  }
  update() {
    const d = this.data
    for (let i = 0; i < d.length; i += 10) {
      d[i].label += ' !!!'
    }
  }
  clear() {
    this.data = []
    this.selected = 0
  }
  swapRows() {
    const d = this.data
    if (d.length > 998) {
      const tmp = d[1]
      d[1] = d[998]
      d[998] = tmp
    }
  }
  select(id: number) {
    this.selected = id
  }
  remove(id: number) {
    const idx = this.data.findIndex(r => r.id === id)
    if (idx !== -1) this.data.splice(idx, 1)
  }
}

export default new BenchmarkStore()
