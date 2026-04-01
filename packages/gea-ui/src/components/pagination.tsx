import * as pagination from '@zag-js/pagination'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class Pagination extends ZagComponent {
  page = 1
  totalPages = 1

  createMachine(_props: any): any {
    return pagination.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      count: props.count ?? 0,
      page: props.page,
      defaultPage: props.defaultPage ?? 1,
      pageSize: props.pageSize,
      defaultPageSize: props.defaultPageSize ?? 10,
      siblingCount: props.siblingCount ?? 1,
      type: props.type ?? 'button',
      onPageChange: (details: pagination.PageChangeDetails) => {
        this.page = details.page
        props.onPageChange?.(details)
      },
      onPageSizeChange: props.onPageSizeChange,
    }
  }

  connectApi(service: any) {
    return pagination.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="prev-trigger"]': 'getPrevTriggerProps',
      '[data-part="next-trigger"]': 'getNextTriggerProps',
      '[data-part="item"]': (api, el) => {
        const value = parseInt((el as HTMLElement).dataset.value || '1', 10)
        return api.getItemProps({ type: 'page', value })
      },
      '[data-part="ellipsis"]': (api, el) => {
        const index = parseInt((el as HTMLElement).dataset.index || '0', 10)
        return api.getEllipsisProps({ index })
      },
    }
  }

  syncState(api: any) {
    this.page = api.page
    this.totalPages = api.totalPages
  }

  template(props: any) {
    return (
      <nav data-part="root" class={`pagination-root ${props.class || ''}`}>
        <div class="flex items-center gap-1">
          <button
            data-part="prev-trigger"
            class="pagination-prev inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm shadow-xs hover:bg-accent disabled:opacity-50"
          >
            &lsaquo; Prev
          </button>
          <button
            data-part="next-trigger"
            class="pagination-next inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm shadow-xs hover:bg-accent disabled:opacity-50"
          >
            Next &rsaquo;
          </button>
        </div>
      </nav>
    )
  }
}
