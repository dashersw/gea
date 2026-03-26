import { Component, router } from '@geajs/core'
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Input,
  Label,
  Select,
  Toaster,
  ToastStore,
} from '@geajs/ui'
import store, { CATEGORY_COLORS } from './store'
import type { Category } from './store'
import TransactionRow from './transaction-row'
import BudgetCard from './budget-card'

const EXPENSE_CATEGORIES: Category[] = ['Food', 'Transport', 'Housing', 'Entertainment', 'Health', 'Shopping']

export default class App extends Component {
  created() {
    router.setRoutes({
      '/': App,
    })
  }

  template() {
    return (
      <div class="finance-layout">
        <header class="finance-header">
          <div>
            <h1 class="finance-title">Finance Tracker</h1>
            <p class="finance-sub">March 2026</p>
          </div>
          <Button click={store.openAdd}>+ Add Transaction</Button>
        </header>

        {/* Summary Cards */}
        <div class="summary-grid">
          <Card>
            <CardContent class="summary-card">
              <span class="summary-label">Total Income</span>
              <span class="summary-value income">+${store.totalIncome.toFixed(2)}</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="summary-card">
              <span class="summary-label">Total Expenses</span>
              <span class="summary-value expense">-${store.totalExpenses.toFixed(2)}</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="summary-card">
              <span class="summary-label">Balance</span>
              <span class={`summary-value ${store.balance >= 0 ? 'income' : 'expense'}`}>
                {store.balance >= 0 ? '+' : ''}${store.balance.toFixed(2)}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="summary-card">
              <span class="summary-label">Transactions</span>
              <span class="summary-value neutral">{store.transactions.length}</span>
            </CardContent>
          </Card>
        </div>

        <div class="main-grid">
          {/* Transactions */}
          <div class="transactions-panel">
            <div class="panel-header">
              <h2 class="panel-title">Transactions</h2>
              <div class="filters-row">
                <Select
                  label=""
                  placeholder="All categories"
                  items={[
                    { value: 'All', label: 'All categories' },
                    ...['Food', 'Transport', 'Housing', 'Entertainment', 'Health', 'Shopping', 'Income'].map((c) => ({
                      value: c,
                      label: c,
                    })),
                  ]}
                  onValueChange={(d: any) => store.setFilterCategory(d.value[0])}
                />
                <Select
                  label=""
                  placeholder="All types"
                  items={[
                    { value: 'All', label: 'All types' },
                    { value: 'income', label: 'Income' },
                    { value: 'expense', label: 'Expenses' },
                  ]}
                  onValueChange={(d: any) => store.setFilterType(d.value[0])}
                />
              </div>
            </div>

            <div class="tx-list">
              {store.filteredTransactions.length === 0 ? (
                <p class="empty-state">No transactions match your filters.</p>
              ) : (
                store.filteredTransactions.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
              )}
            </div>
          </div>

          {/* Budget Overview */}
          <div class="budget-panel">
            <Card>
              <CardHeader>
                <CardTitle>Budget Overview</CardTitle>
                <CardDescription>Monthly spending vs budget.</CardDescription>
              </CardHeader>
              <CardContent>
                <div class="budget-list">
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <BudgetCard key={cat} category={cat} />
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Spending Breakdown</CardTitle>
                <CardDescription>This month by category.</CardDescription>
              </CardHeader>
              <CardContent>
                <div class="breakdown-list">
                  {Object.entries(store.spendingByCategory)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, amount]) => {
                      const color = CATEGORY_COLORS[cat as Category] ?? '#888'
                      const pct = Math.round((amount / store.totalExpenses) * 100)
                      return (
                        <div key={cat} class="breakdown-row">
                          <span class="breakdown-dot" style={{ background: color }} />
                          <span class="breakdown-cat">{cat}</span>
                          <div class="breakdown-bar-wrap">
                            <div class="breakdown-bar" style={{ width: `${pct}%`, background: color }} />
                          </div>
                          <span class="breakdown-pct">{pct}%</span>
                          <span class="breakdown-amt">${amount.toFixed(0)}</span>
                        </div>
                      )
                    })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Add Transaction Modal */}
        {store.addOpen && (
          <div class="modal-backdrop" click={store.closeAdd}>
            <div class="modal-box" click={(e: Event) => e.stopPropagation()}>
              <h3 class="modal-title">Add Transaction</h3>

              <div class="form-field">
                <Label htmlFor="tx-desc">Description</Label>
                <Input
                  inputId="tx-desc"
                  placeholder="e.g. Grocery run"
                  value={store.draftDescription}
                  onInput={store.setDraftDescription}
                />
              </div>

              <div class="form-row">
                <div class="form-field">
                  <Label htmlFor="tx-amount">Amount ($)</Label>
                  <Input
                    inputId="tx-amount"
                    type="number"
                    placeholder="0.00"
                    value={store.draftAmount}
                    onInput={store.setDraftAmount}
                  />
                </div>
                <div class="form-field">
                  <Label htmlFor="tx-date">Date</Label>
                  <Input inputId="tx-date" type="date" value={store.draftDate} onInput={store.setDraftDate} />
                </div>
              </div>

              <div class="form-row">
                <div class="form-field">
                  <Select
                    label="Type"
                    defaultValue="expense"
                    items={[
                      { value: 'expense', label: 'Expense' },
                      { value: 'income', label: 'Income' },
                    ]}
                    onValueChange={(d: any) => store.setDraftType(d.value[0])}
                  />
                </div>
                <div class="form-field">
                  <Select
                    label="Category"
                    defaultValue="Food"
                    items={[...EXPENSE_CATEGORIES, 'Income' as Category].map((c) => ({ value: c, label: c }))}
                    onValueChange={(d: any) => store.setDraftCategory(d.value[0])}
                  />
                </div>
              </div>

              <div class="modal-actions">
                <Button variant="outline" click={store.closeAdd}>
                  Cancel
                </Button>
                <Button
                  disabled={!store.draftValid}
                  click={() => {
                    store.addTransaction()
                    ToastStore.success({
                      title: 'Transaction added',
                      description: `${store.draftDescription || 'Entry'} saved.`,
                    })
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        )}

        <Toaster />
      </div>
    )
  }
}
