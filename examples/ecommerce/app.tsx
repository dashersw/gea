import { Component } from '@geajs/core'
import { router } from '@geajs/core/router'
import Badge from '@geajs/ui/badge'
import Select from '@geajs/ui/select'
import Separator from '@geajs/ui/separator'
import { Toaster } from '@geajs/ui/toast'
import store, { CATEGORIES } from './store'
import ProductCard from './product-card'
import CartDrawer from './cart-drawer'
import CheckoutDialog from './checkout-dialog'

export default class App extends Component {
  created() {
    router.setRoutes({
      '/': App,
      '/category/:cat': App,
    })

    router.observe('path', () => {
      const cat = router.params.cat
      if (cat && CATEGORIES.includes(cat) && cat !== store.selectedCategory) {
        store.setCategory(cat)
      } else if (!router.params.cat && store.selectedCategory !== 'All') {
        store.setCategory('All')
      }
    })

    const cat = router.params.cat
    if (cat && CATEGORIES.includes(cat)) {
      store.setCategory(cat)
    }
  }

  template() {
    return (
      <div class="store-layout">
        {/* Header */}
        <header class="store-header">
          <div class="store-header-inner">
            <h1 class="store-brand">ShopGea</h1>
            <div class="header-actions">
              <button class="cart-button" click={store.openCart} aria-label="Open cart">
                🛍 Cart
                {store.cartCount > 0 && <Badge class="cart-badge">{store.cartCount}</Badge>}
              </button>
            </div>
          </div>
        </header>

        <div class="store-body">
          {/* Filters */}
          <aside class="filters-panel">
            <h2 class="filters-title">Filters</h2>

            <div class="filter-group">
              <h3 class="filter-label">Category</h3>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  class={`filter-btn ${store.selectedCategory === cat ? 'active' : ''}`}
                  click={() => {
                    store.setCategory(cat)
                    router.push(cat === 'All' ? '/' : `/category/${cat}`)
                  }}
                  data-category={cat}
                >
                  {cat}
                </button>
              ))}
            </div>

            <Separator class="my-4" />

            <div class="filter-group">
              <Select
                label="Min Rating"
                defaultValue="0"
                items={[
                  { value: '0', label: 'Any rating' },
                  { value: '3', label: '3+ stars' },
                  { value: '4', label: '4+ stars' },
                  { value: '5', label: '5 stars only' },
                ]}
                onValueChange={(d: any) => store.setMinRating(d.value[0])}
              />
            </div>

            <Separator class="my-4" />

            <div class="filter-group">
              <label class="instock-label">
                <input
                  type="checkbox"
                  checked={store.inStockOnly}
                  change={store.toggleInStock}
                  class="instock-checkbox"
                />
                In stock only
              </label>
            </div>

            <Separator class="my-4" />
            <p class="filter-count">{store.filteredProducts.length} products</p>
          </aside>

          {/* Product Grid */}
          <main class="product-grid">
            {store.filteredProducts.length === 0 ? (
              <div class="no-results">
                <p>No products match your filters.</p>
                <button
                  class="filter-btn"
                  click={() => {
                    store.setCategory('All')
                    store.minRating = 0
                    store.inStockOnly = false
                    router.push('/')
                  }}
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              store.filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)
            )}
          </main>
        </div>

        {store.cartOpen && <CartDrawer />}
        {store.checkoutOpen && <CheckoutDialog />}
        <Toaster />
      </div>
    )
  }
}
