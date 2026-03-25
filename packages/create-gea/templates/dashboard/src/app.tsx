import { Component } from '@geajs/core'
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Progress,
  Avatar,
  Tabs,
  Separator,
  Skeleton,
} from '@geajs/ui'

const stats = [
  { label: 'Total Revenue', value: '$45,231.89', change: '+20.1% from last month', positive: true },
  { label: 'Subscriptions', value: '+2,350', change: '+180.1% from last month', positive: true },
  { label: 'Sales', value: '+12,234', change: '+19% from last month', positive: true },
  { label: 'Active Now', value: '+573', change: '+201 since last hour', positive: true },
]

const activities = [
  { name: 'Olivia Martin', action: 'purchased Pro plan', time: '2 min ago', src: '' },
  { name: 'Jackson Lee', action: 'uploaded 3 files', time: '15 min ago', src: '' },
  { name: 'Isabella Nguyen', action: 'commented on a task', time: '1 hour ago', src: '' },
  { name: 'William Kim', action: 'completed onboarding', time: '3 hours ago', src: '' },
  { name: 'Sofia Davis', action: 'updated profile settings', time: '5 hours ago', src: '' },
]

const team = [
  { name: 'Sofia Davis', role: 'Engineering Lead', initials: 'SD' },
  { name: 'Jackson Lee', role: 'Product Design', initials: 'JL' },
  { name: 'Isabella Nguyen', role: 'Frontend Dev', initials: 'IN' },
  { name: 'William Kim', role: 'Backend Dev', initials: 'WK' },
]

export default class App extends Component {
  template() {
    return (
      <div class="dashboard">
        <div class="dashboard-header">
          <div>
            <h1 style="font-size: 1.5rem; font-weight: 700;">Dashboard</h1>
            <p style="color: hsl(var(--muted-foreground)); font-size: 0.875rem;">Welcome back, here's your overview.</p>
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <Badge>Live</Badge>
            <Button variant="outline" size="sm">
              Download Report
            </Button>
            <Button size="sm">Create New</Button>
          </div>
        </div>

        <div class="stat-grid">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardContent class="stat-card p-4">
                <span class="stat-label">{stat.label}</span>
                <span class="stat-value">{stat.value}</span>
                <span class={`stat-change ${stat.positive ? 'positive' : 'negative'}`}>{stat.change}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        <div class="main-grid">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
              <CardDescription>Revenue breakdown by category.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs
                defaultValue="revenue"
                items={[
                  { value: 'revenue', label: 'Revenue', content: '' },
                  { value: 'orders', label: 'Orders', content: '' },
                  { value: 'customers', label: 'Customers', content: '' },
                ]}
              />
              <div class="chart-placeholder" style="margin-top: 1rem;">
                Revenue chart would render here
              </div>
              <Separator class="my-4" />
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <p style="font-size: 0.875rem; font-weight: 500;">Monthly Target</p>
                  <p style="font-size: 0.75rem; color: hsl(var(--muted-foreground));">72% of $50,000 goal</p>
                </div>
                <Badge variant="secondary">On Track</Badge>
              </div>
              <Progress value={72} class="mt-2" />
            </CardContent>
          </Card>

          <div style="display: flex; flex-direction: column; gap: 1.5rem;">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest actions from your team.</CardDescription>
              </CardHeader>
              <CardContent>
                {activities.map((a) => (
                  <div key={a.name} class="activity-item">
                    <Avatar name={a.name} />
                    <div class="activity-text">
                      <strong>{a.name}</strong> {a.action}
                    </div>
                    <span class="activity-time">{a.time}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Team</CardTitle>
                <CardDescription>Your core team members.</CardDescription>
              </CardHeader>
              <CardContent>
                <div class="team-list">
                  {team.map((m) => (
                    <div key={m.name} class="team-member">
                      <Avatar name={m.name} fallback={m.initials} />
                      <div class="team-info">
                        <div class="team-name">{m.name}</div>
                        <div class="team-role">{m.role}</div>
                      </div>
                      <Badge variant="outline">{m.role.split(' ')[0]}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Loading State</CardTitle>
                <CardDescription>Skeleton placeholders.</CardDescription>
              </CardHeader>
              <CardContent>
                <div class="skeleton-group">
                  <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <Skeleton class="h-10 w-10 rounded-full" />
                    <div style="flex: 1;">
                      <Skeleton class="h-4 w-3/4 mb-2" />
                      <Skeleton class="h-3 w-1/2" />
                    </div>
                  </div>
                  <Skeleton class="h-4 w-full" />
                  <Skeleton class="h-4 w-5/6" />
                  <Skeleton class="h-20 w-full rounded-lg" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <CardFooter
          class="mt-6"
          style="justify-content: center; color: hsl(var(--muted-foreground)); font-size: 0.75rem;"
        >
          gea-ui Dashboard Example — All components are accessible and fully keyboard-navigable.
        </CardFooter>
      </div>
    )
  }
}
