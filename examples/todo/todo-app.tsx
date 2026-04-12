import { Component } from '@geajs/core'
import todoStore from './todo-store'
import type { Filter } from './todo-store'
import TodoInput from './components/TodoInput'
import TodoItem from './components/TodoItem'
import TodoFilters from './components/TodoFilters'

export default class TodoApp extends Component {
  template() {
    const { filter, filteredTodos, activeCount, completedCount } = todoStore

    return (
      <div class="todo-app">
        <h1>Todo</h1>
        <TodoInput draft={todoStore.draft} onDraftChange={(e: Event) => todoStore.setDraft(e)} onAdd={() => todoStore.add()} />
        <ul class="todo-list">
          {filteredTodos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={() => todoStore.toggle(todo.id)}
              onRemove={() => todoStore.remove(todo.id)}
              onRename={(text: string) => todoStore.rename(todo.id, text)}
            />
          ))}
        </ul>
        {todoStore.todos.length > 0 && (
          <TodoFilters
            filter={filter}
            activeCount={activeCount}
            completedCount={completedCount}
            onFilter={(nextFilter: Filter) => todoStore.setFilter(nextFilter)}
          />
        )}
      </div>
    )
  }
}
