import { Component } from '@geajs/core'
import { router } from '@geajs/core/router'
import Avatar from '@geajs/ui/avatar'
import Badge from '@geajs/ui/badge'
import store from './store'

export default class ConversationItem extends Component {
  declare props: { id: string; name: string; lastMessage: string; timestamp: number; unread: number; online: boolean }

  template({ id, name, lastMessage, timestamp, unread, online }) {
    const isActive = store.activeConversationId === id
    const isTyping = store.typingConversationId === id && !isActive

    return (
      <button
        class={`conv-item ${isActive ? 'active' : ''}`}
        click={() => {
          store.selectConversation(id)
          router.push(`/conversations/${id}`)
        }}
        data-conv-id={id}
      >
        <div class="conv-avatar-wrap">
          <Avatar name={name} />
          {online && <span class="online-dot" />}
        </div>
        <div class="conv-details">
          <div class="conv-top-row">
            <span class="conv-name">{name}</span>
            <span class="conv-time">{store.formatTime(timestamp)}</span>
          </div>
          <div class="conv-bottom-row">
            <span class={`conv-preview ${unread > 0 && !isActive ? 'unread' : ''}`}>
              {isTyping ? <em class="typing-indicator">typing…</em> : lastMessage}
            </span>
            {unread > 0 && !isActive && <Badge class="unread-badge">{unread}</Badge>}
          </div>
        </div>
      </button>
    )
  }
}
