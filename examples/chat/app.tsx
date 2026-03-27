import { Component } from '@geajs/core'
import { router, RouterView } from '@geajs/core/router'
import Badge from '@geajs/ui/badge'
import Separator from '@geajs/ui/separator'
import store from './store'
import ConversationItem from './conversation-item'
import MessageThread from './message-thread'

const routes = {
  '/': MessageThread,
  '/conversations/:id': MessageThread,
} as const

export default class App extends Component {
  created() {
    // Set routes eagerly so params are available
    router.setRoutes(routes)

    // Sync initial route to store
    const initialId = router.params.id
    if (initialId) {
      store.selectConversation(initialId)
    }

    // Sync router navigation to store
    router.observe('path', () => {
      const id = router.params.id
      if (id && id !== store.activeConversationId) {
        store.selectConversation(id)
      }
    })
  }

  template() {
    return (
      <div class="chat-layout">
        {/* Sidebar */}
        <aside class="chat-sidebar">
          <div class="sidebar-header">
            <h1 class="chat-brand">Messages</h1>
            {store.totalUnread > 0 && <Badge>{store.totalUnread}</Badge>}
          </div>
          <Separator />
          <div class="conv-list">
            {store.conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                id={conv.id}
                name={conv.name}
                lastMessage={conv.lastMessage}
                timestamp={conv.timestamp}
                unread={conv.unread}
                online={conv.online}
              />
            ))}
          </div>
        </aside>

        {/* Thread */}
        <main class="chat-main">
          <RouterView routes={routes} />
        </main>
      </div>
    )
  }
}
