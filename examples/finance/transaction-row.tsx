import { Component } from '@geajs/core'
import { Badge, ToastStore } from '@geajs/ui'
import store, { CATEGORY_COLORS } from './store'
import type { Transaction } from './store'

export default class TransactionRow extends Component {
  declare props: { tx: Transaction }

  template({ tx }: { tx: Transaction }) {
    const color = CATEGORY_COLORS[tx.category]
    return (
      <div class="tx-row" data-tx-id={tx.id}>
        <div class="tx-icon" style={{ background: `${color}22`, color }}>
          {tx.category[0]}
        </div>
        <div class="tx-info">
          <span class="tx-desc">{tx.description}</span>
          <span class="tx-date">{tx.date}</span>
        </div>
        <Badge class="tx-cat-badge" variant="outline" style={{ color, borderColor: `${color}40` }}>
          {tx.category}
        </Badge>
        <span class={`tx-amount ${tx.type}`}>
          {tx.type === 'income' ? '+' : '-'}${tx.amount.toFixed(2)}
        </span>
        <button
          class="tx-remove"
          click={() => {
            store.removeTransaction(tx.id)
            ToastStore.success({ title: 'Removed', description: `"${tx.description}" deleted.` })
          }}
          aria-label="Remove transaction"
        >
          ✕
        </button>
      </div>
    )
  }
}
