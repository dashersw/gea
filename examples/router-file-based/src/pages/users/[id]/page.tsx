import { Component } from '@geajs/core'
import { Link } from '@geajs/core'

interface User {
  id: string
  name: string
  role: string
  bio: string
}

const USERS: Record<string, User> = {
  '1': { id: '1', name: 'Alice', role: 'Engineer', bio: 'Loves building compilers and reactive frameworks.' },
  '2': { id: '2', name: 'Bob', role: 'Designer', bio: 'Passionate about minimal interfaces and typography.' },
  '3': { id: '3', name: 'Charlie', role: 'PM', bio: 'Keeps the trains running on time.' },
  '4': { id: '4', name: 'Dana', role: 'DevRel', bio: 'Makes developers feel welcome and builds great demos.' },
}

export default class UserProfilePage extends Component {
  template({ id }: { id: string }) {
    const user = USERS[id]

    if (!user) {
      return (
        <div class="view">
          <h1>User not found</h1>
          <p>No user with id <strong>{id}</strong>.</p>
          <Link to="/users" label="← Back to Users" class="back-link" />
        </div>
      )
    }

    return (
      <div class="view user-profile">
        <Link to="/users" label="← Back to Users" class="back-link" />
        <div class="avatar">{user.name[0]}</div>
        <h1>{user.name}</h1>
        <span class="role-badge">{user.role}</span>
        <p>{user.bio}</p>
      </div>
    )
  }
}
