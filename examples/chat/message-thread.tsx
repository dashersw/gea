import { Component } from '@geajs/core'
import { Avatar, Button, Separator } from '@geajs/ui'
import store from './store'
import MessageBubble from './message-bubble'

export default class MessageThread extends Component {
  onAfterRender() {
    const el = document.querySelector('.messages-body')
    if (el) el.scrollTop = el.scrollHeight
  }

  template() {
    const conv = store.activeConversation
    if (!conv) return <div class="no-conv">Select a conversation</div>

    const isTyping = store.typingConversationId === conv.id

    return (
      <div class="thread">
        <div class="thread-header">
          <div class="thread-header-left">
            <Avatar name={conv.name} />
            <div>
              <p class="thread-name">{conv.name}</p>
              <p class="thread-status">{conv.online ? 'Online' : 'Offline'}</p>
            </div>
          </div>
        </div>
        <Separator />

        <div class="messages-body">
          {store.activeMessages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isTyping && (
            <div class="message-wrap theirs typing-wrap">
              <Avatar name={conv.name} />
              <div class="bubble bubble-theirs typing-dots">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </div>

        <div class="input-area">
          <Separator />
          <div class="input-row">
            <input
              class="message-input"
              placeholder={`Message ${conv.name}…`}
              value={store.draft}
              input={store.setDraft}
              keydown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  store.sendMessage()
                }
              }}
              aria-label="Message input"
            />
            <Button click={store.sendMessage} disabled={!store.draft.trim()}>
              Send
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
