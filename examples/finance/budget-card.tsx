import { Component } from '@geajs/core'
import { Progress } from '@geajs/ui'
import store, { CATEGORY_COLORS, BUDGETS } from './store'
import type { Category } from './store'

export default class BudgetCard extends Component {
  declare props: { category: Category }

  template({ category }: { category: Category }) {
    const budget = BUDGETS[category]
    const spent = store.spendingByCategory[category] ?? 0
    const pct = store.budgetPercent(category)
    const over = spent > budget
    const color = CATEGORY_COLORS[category]

    return (
      <div class="budget-card" data-budget-category={category}>
        <div class="budget-header">
          <span class="budget-cat" style={{ color }}>
            {category}
          </span>
          <span class={`budget-amount ${over ? 'over' : ''}`}>
            ${spent.toFixed(0)} / ${budget}
          </span>
        </div>
        <Progress value={pct} class={over ? 'progress-over' : ''} />
        <span class="budget-pct">
          {pct}%{over ? ' — Over budget!' : ''}
        </span>
      </div>
    )
  }
}
