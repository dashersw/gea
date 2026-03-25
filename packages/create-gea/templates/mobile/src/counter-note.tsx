interface CounterNoteProps {
  count: number
}

export default function CounterNote({ count }: CounterNoteProps) {
  return (
    <section class="panel panel-subtle">
      <p class="label">Function component</p>
      <p class="copy">
        This component receives the count as a prop. Count is <strong>{count}</strong>.
      </p>
    </section>
  )
}
