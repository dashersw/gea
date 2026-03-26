import { Component } from '@geajs/core'
import { Avatar, Card, CardContent, CardHeader, CardTitle, CardDescription, Progress, Separator, Tabs } from '@geajs/ui'
import store from './store'

export default class OverviewView extends Component {
  template() {
    const stats = [
      { label: 'Total Users', value: store.users.length.toString(), change: '+12% vs last month' },
      {
        label: 'Active Users',
        value: store.activeCount.toString(),
        change: `${store.activeCount} of ${store.users.length}`,
      },
      { label: 'Admins', value: store.adminCount.toString(), change: 'Full access' },
      { label: 'Monthly Revenue', value: '$24,500', change: '+8.2% vs last month' },
    ]

    const recentActivity = [
      { name: 'Sofia Davis', action: 'invited 2 new members', time: '2m ago' },
      { name: 'Jackson Lee', action: 'updated billing info', time: '1h ago' },
      { name: 'Isabella Nguyen', action: 'completed onboarding', time: '3h ago' },
      { name: 'William Kim', action: 'exported user report', time: '5h ago' },
    ]

    return (
      <div class="view-content">
        <div class="view-header">
          <h2 class="view-title">Overview</h2>
          <p class="view-desc">Welcome back — here's what's happening.</p>
        </div>

        <div class="stat-grid">
          {stats.map((s) => (
            <div key={s.label}>
              <Card>
                <CardContent class="stat-card">
                  <span class="stat-label">{s.label}</span>
                  <span class="stat-value">{s.value}</span>
                  <span class="stat-change">{s.change}</span>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>

        <div class="overview-grid">
          <Card>
            <CardHeader>
              <CardTitle>Performance</CardTitle>
              <CardDescription>This month's key metrics.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs
                defaultValue="users"
                items={[
                  { value: 'users', label: 'Users', content: '' },
                  { value: 'revenue', label: 'Revenue', content: '' },
                  { value: 'churn', label: 'Churn', content: '' },
                ]}
              />
              <div class="chart-bars">
                {[62, 78, 55, 90, 72, 85, 68].map((v, i) => (
                  <div key={i} class="chart-bar-wrap">
                    <div class="chart-bar" style={{ height: `${v}%` }} />
                    <span class="chart-label">{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</span>
                  </div>
                ))}
              </div>
              <Separator class="my-4" />
              <div class="metric-row">
                <span class="metric-label">Monthly target</span>
                <span class="metric-value">72%</span>
              </div>
              <Progress value={72} class="mt-1" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest actions from your team.</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="activity-list">
                {recentActivity.map((a) => (
                  <div key={a.name} class="activity-item">
                    <Avatar name={a.name} />
                    <div class="activity-text">
                      <strong>{a.name}</strong> {a.action}
                    </div>
                    <span class="activity-time">{a.time}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }
}
