import * as treeView from '@zag-js/tree-view'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class TreeView extends ZagComponent {
  selectedValue: string[] = []
  expandedValue: string[] = []

  createMachine(_props: any): any {
    return treeView.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      collection: props.collection,
      selectedValue: props.selectedValue,
      defaultSelectedValue: props.defaultSelectedValue,
      expandedValue: props.expandedValue,
      defaultExpandedValue: props.defaultExpandedValue,
      selectionMode: props.selectionMode ?? 'single',
      expandOnClick: props.expandOnClick ?? true,
      onSelectionChange: (details: treeView.SelectionChangeDetails) => {
        this.selectedValue = details.selectedValue
        props.onSelectionChange?.(details)
      },
      onExpandedChange: (details: treeView.ExpandedChangeDetails) => {
        this.expandedValue = details.expandedValue
        props.onExpandedChange?.(details)
      },
    }
  }

  connectApi(service: any) {
    return treeView.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="label"]': 'getLabelProps',
      '[data-part="tree"]': 'getTreeProps',
    }
  }

  syncState(api: any) {
    this.selectedValue = api.selectedValue
    this.expandedValue = api.expandedValue
  }

  template(props: any) {
    return (
      <div data-part="root" class={props.class || ''}>
        {props.label && <label data-part="label" class="tree-view-label text-sm font-medium mb-2 block">{props.label}</label>}
        <div data-part="tree" class="tree-view-tree" role="tree">
          {props.children}
        </div>
      </div>
    )
  }
}
