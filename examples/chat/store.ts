import { Store } from '@geajs/core'

export interface Message {
  id: string
  senderId: string
  text: string
  timestamp: number
  read: boolean
}

export interface Conversation {
  id: string
  name: string
  lastMessage: string
  timestamp: number
  unread: number
  online: boolean
}

function uid() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

const NOW = Date.now()

const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: 'c1',
    name: 'Sofia Davis',
    lastMessage: 'Sure, sounds good!',
    timestamp: NOW - 120000,
    unread: 2,
    online: true,
  },
  {
    id: 'c2',
    name: 'Jackson Lee',
    lastMessage: 'Can we reschedule?',
    timestamp: NOW - 3600000,
    unread: 0,
    online: false,
  },
  {
    id: 'c3',
    name: 'Team General',
    lastMessage: 'New release deployed 🚀',
    timestamp: NOW - 7200000,
    unread: 5,
    online: true,
  },
  {
    id: 'c4',
    name: 'Isabella Nguyen',
    lastMessage: 'Thanks for the review!',
    timestamp: NOW - 86400000,
    unread: 0,
    online: true,
  },
]

const INITIAL_MESSAGES: Record<string, Message[]> = {
  c1: [
    { id: 'm1', senderId: 'c1', text: 'Hey! Are you free this afternoon?', timestamp: NOW - 300000, read: true },
    { id: 'm2', senderId: 'me', text: 'Let me check my calendar.', timestamp: NOW - 240000, read: true },
    { id: 'm3', senderId: 'c1', text: 'Sure, sounds good!', timestamp: NOW - 120000, read: false },
    { id: 'm4', senderId: 'c1', text: 'I was thinking around 3pm?', timestamp: NOW - 60000, read: false },
  ],
  c2: [
    { id: 'm5', senderId: 'c2', text: 'Hi, can we reschedule our meeting?', timestamp: NOW - 7200000, read: true },
    { id: 'm6', senderId: 'me', text: 'Of course, when works for you?', timestamp: NOW - 3700000, read: true },
    { id: 'm7', senderId: 'c2', text: 'Can we reschedule?', timestamp: NOW - 3600000, read: true },
  ],
  c3: [
    { id: 'm8', senderId: 'c3-bot', text: 'New release deployed 🚀', timestamp: NOW - 7200000, read: false },
    { id: 'm9', senderId: 'c3-bot', text: 'v2.4.1 is now live in production', timestamp: NOW - 7100000, read: false },
    { id: 'm10', senderId: 'me', text: 'Great work team!', timestamp: NOW - 7000000, read: true },
    { id: 'm11', senderId: 'c3-bot', text: 'Monitoring looks stable ✅', timestamp: NOW - 6900000, read: false },
    { id: 'm12', senderId: 'c3-bot', text: 'No errors in the last hour', timestamp: NOW - 6800000, read: false },
  ],
  c4: [
    { id: 'm13', senderId: 'c4', text: 'I just reviewed the PR.', timestamp: NOW - 90000000, read: true },
    {
      id: 'm14',
      senderId: 'me',
      text: 'Awesome, let me know if anything needs changing.',
      timestamp: NOW - 88000000,
      read: true,
    },
    { id: 'm15', senderId: 'c4', text: 'Thanks for the review!', timestamp: NOW - 86400000, read: true },
  ],
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  return new Date(ts).toLocaleDateString()
}

export class ChatStore extends Store {
  conversations: Conversation[] = INITIAL_CONVERSATIONS
  messages: Record<string, Message[]> = INITIAL_MESSAGES
  activeConversationId: string = 'c1'
  draft = ''
  typingConversationId: string | null = null
  typingTimer: ReturnType<typeof setTimeout> | null = null

  get activeConversation(): Conversation | null {
    return this.conversations.find((c) => c.id === this.activeConversationId) ?? null
  }

  get activeMessages(): Message[] {
    return this.messages[this.activeConversationId] ?? []
  }

  get totalUnread(): number {
    return this.conversations.reduce((sum, c) => sum + c.unread, 0)
  }

  formatTime(ts: number): string {
    return formatTime(ts)
  }

  selectConversation(id: string): void {
    this.activeConversationId = id
    // Mark as read
    const conv = this.conversations.find((c) => c.id === id)
    if (conv) conv.unread = 0
    const msgs = this.messages[id]
    if (msgs) msgs.forEach((m) => (m.read = true))
    this.draft = ''
  }

  setDraft(e: { target: EventTarget | null }): void {
    const t = e.target as HTMLInputElement | null
    if (t && 'value' in t) this.draft = t.value
  }

  sendMessage(): void {
    const text = this.draft.trim()
    if (!text) return
    const id = this.activeConversationId
    if (!this.messages[id]) this.messages[id] = []
    const msg: Message = {
      id: uid(),
      senderId: 'me',
      text,
      timestamp: Date.now(),
      read: true,
    }
    this.messages[id].push(msg)
    const conv = this.conversations.find((c) => c.id === id)
    if (conv) {
      conv.lastMessage = text
      conv.timestamp = msg.timestamp
    }
    this.draft = ''
    // Simulate reply after delay
    this.simulateReply(id)
  }

  simulateReply(convId: string): void {
    const replies: Record<string, string[]> = {
      c1: ['Got it!', 'Sounds great 👍', 'Perfect, see you then!', 'Sure thing!'],
      c2: ['Thanks for understanding.', 'How about tomorrow at 2pm?', 'Works for me!'],
      c3: ['Acknowledged ✓', 'All systems go 🚀', 'Roger that!'],
      c4: ['Happy to help!', 'Looks good to me!', 'Let me check and get back.'],
    }
    const options = replies[convId] ?? ['👍', 'Got it!', 'Thanks!']
    const text = options[Math.floor(Math.random() * options.length)]

    this.typingConversationId = convId

    if (this.typingTimer) clearTimeout(this.typingTimer)
    this.typingTimer = setTimeout(() => {
      this.typingConversationId = null
      if (!this.messages[convId]) this.messages[convId] = []
      this.messages[convId].push({
        id: uid(),
        senderId: convId,
        text,
        timestamp: Date.now(),
        read: this.activeConversationId === convId,
      })
      const conv = this.conversations.find((c) => c.id === convId)
      if (conv) {
        conv.lastMessage = text
        conv.timestamp = Date.now()
        if (this.activeConversationId !== convId) conv.unread++
      }
    }, 1500)
  }
}

export default new ChatStore()
