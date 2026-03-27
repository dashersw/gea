import { Component } from '@geajs/core'
import { Link } from '@geajs/core/router'

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
}

export default class UserProfile extends Component {
  template({ id }: { id: string }) {
    const user = USERS[id]

    if (!user) {
      return (
        <div class="view">
          <h1>User not found</h1>
          <p>
            No user with id <strong>{id}</strong>.
          </p>
          <Link to="/" label="Back to Home" class="back-link" />
        </div>
      )
    }

    return (
      <div class="view user-profile">
        <div class="avatar">{user.name[0]}</div>
        <h1>{user.name}</h1>
        <span class="role">{user.role}</span>
        <p>{user.bio}</p>
      </div>
    )
  }
}
