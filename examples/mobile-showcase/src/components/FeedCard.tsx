interface FeedCardItem {
  id: string
  title: string
  body: string
  author: string
  time: string
  color: string
}

interface FeedCardProps {
  item: FeedCardItem
}

export default function FeedCard({ item }: FeedCardProps) {
  return (
    <div class="feed-card">
      <div class="feed-card-avatar" style={{ backgroundColor: item.color }}>
        {item.author[0]}
      </div>
      <div class="feed-card-content">
        <div class="feed-card-header">
          <span class="feed-card-author">{item.author}</span>
          <span class="feed-card-time">{item.time}</span>
        </div>
        <h3 class="feed-card-title">{item.title}</h3>
        <p class="feed-card-body">{item.body}</p>
      </div>
    </div>
  )
}
