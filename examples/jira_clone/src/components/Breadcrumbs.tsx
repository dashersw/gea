export default function Breadcrumbs({ items = [] }) {
  return (
    <div class="breadcrumbs">
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span class="breadcrumbs-separator">/</span>}
          <span class="breadcrumbs-item">{item}</span>
        </span>
      ))}
    </div>
  )
}
