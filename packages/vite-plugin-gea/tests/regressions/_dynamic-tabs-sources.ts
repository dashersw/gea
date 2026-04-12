/**
 * Inline sources for the **dynamic tabs** regression fixture: functional tab content, a `Tabs`
 * wrapper with two `.map()` regions (titles + panels), and an `App` that wires `activeTabIndex`.
 * Used by runtime and HMR tab tests (delegated map clicks, template-literal keys, tab switching).
 */

export const DYNAMIC_TABS_TAB_CONTENT_FUNCTIONAL = `
export default function TabContentFunctional({ number }: { number: number }) {
  return (
    <div>
      <h2>Tab Content {number}</h2>
    </div>
  )
}
`

export const DYNAMIC_TABS_TABS = `
import { Component } from '@geajs/core'

type Tab = {
  index: number
  title: string
  content: () => Component
}

interface TabsProps {
  tabs: Tab[]
  activeTabIndex: number
  onTabChange: (index: number) => void
}

export default function Tabs({ tabs, activeTabIndex, onTabChange }: TabsProps) {
  return (
    <div>
      <div class="tab-titles">
        {tabs.map((tab) => (
          <button
            key={\`\${tab.title}-button\`}
            class={\`\${tab.index === activeTabIndex ? 'active' : ''}\`}
            data-index={tab.index}
            click={() => onTabChange(tab.index)}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <div class="tab-contents">
        {tabs.map((tab) => (
          <div
            key={\`\${tab.index}-content\`}
            class={\`tab-content-wrapper \${tab.index === activeTabIndex ? 'active' : ''}\`}
          >
            {tab.content()}
          </div>
        ))}
      </div>
    </div>
  )
}
`

export const DYNAMIC_TABS_APP = `
import { Component } from '@geajs/core'
import Tabs from './tabs/tabs'
import TabContentFunctional from './tab-content-functional'

type Tab = {
  index: number
  title: string
  content: () => Component | string
}

export default class App extends Component {
  activeTabIndex = 0
  tabs: Tab[] = [
    { index: 0, title: 'Tab 1', content: () => <TabContentFunctional number={0} /> },
    { index: 1, title: 'Tab 2', content: () => <TabContentFunctional number={1} /> },
    { index: 2, title: 'Tab 3', content: () => <TabContentFunctional number={2} /> },
    { index: 3, title: 'Tab 4', content: () => <TabContentFunctional number={3} /> },
  ]

  setActiveTab(index: number) {
    this.activeTabIndex = index
  }

  template() {
    return (
      <div>
        <Tabs
          tabs={this.tabs}
          activeTabIndex={this.activeTabIndex}
          onTabChange={(index: number) => this.setActiveTab(index)}
        />
      </div>
    )
  }
}
`
