import { Component } from '@geajs/core'
import { Link } from '@geajs/core'

const USERS = [
  { id: '1', name: 'Alice', role: 'Engineer' },
  { id: '2', name: 'Bob', role: 'Designer' },
  { id: '3', name: 'Charlie', role: 'PM' },
  { id: '4', name: 'Dana', role: 'DevRel' },
]

export default class UsersPage extends Component {
  template() {
    return (
      <div class="view">
        <h1>Users</h1>
        <p>Click a user to view their profile.</p>
        <div class="user-list">
          {USERS.map((user) => (
            <Link key={user.id} to={`/users/${user.id}`} class="user-row">
              <div class="avatar-sm">{user.name[0]}</div>
              <div class="user-info">
                <span class="user-name">{user.name}</span>
                <span class="role">{user.role}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    )
  }
}
