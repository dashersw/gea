import { Component } from '@geajs/core'
import Button from '@geajs/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@geajs/ui/card'
import Checkbox from '@geajs/ui/checkbox'
import FileUpload from '@geajs/ui/file-upload'
import Input from '@geajs/ui/input'
import Label from '@geajs/ui/label'
import NumberInput from '@geajs/ui/number-input'
import PinInput from '@geajs/ui/pin-input'
import RadioGroup from '@geajs/ui/radio-group'
import Select from '@geajs/ui/select'
import Separator from '@geajs/ui/separator'
import Slider from '@geajs/ui/slider'
import Switch from '@geajs/ui/switch'
import TagsInput from '@geajs/ui/tags-input'
import Textarea from '@geajs/ui/textarea'

export default class App extends Component {
  template() {
    return (
      <div class="settings-page">
        <div class="settings-header">
          <h1>Settings</h1>
          <p>Manage your account settings and preferences.</p>
        </div>

        <Card class="mb-6">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Update your personal information.</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="form-grid">
              <div class="form-field">
                <Label htmlFor="firstName">First Name</Label>
                <Input inputId="firstName" placeholder="John" />
              </div>
              <div class="form-field">
                <Label htmlFor="lastName">Last Name</Label>
                <Input inputId="lastName" placeholder="Doe" />
              </div>
              <div class="form-field full-width">
                <Label htmlFor="email">Email</Label>
                <Input inputId="email" type="email" placeholder="john@example.com" />
              </div>
              <div class="form-field full-width">
                <Label htmlFor="bio">Bio</Label>
                <Textarea placeholder="Tell us about yourself..." rows={3} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card class="mb-6">
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>Configure your experience.</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="form-field" style={{ marginBottom: '1.5rem' }}>
              <Select
                label="Language"
                placeholder="Select a language..."
                items={[
                  { value: 'en', label: 'English' },
                  { value: 'es', label: 'Spanish' },
                  { value: 'fr', label: 'French' },
                  { value: 'de', label: 'German' },
                  { value: 'ja', label: 'Japanese' },
                ]}
              />
            </div>

            <div class="form-field" style={{ marginBottom: '1.5rem' }}>
              <RadioGroup
                label="Theme"
                defaultValue="system"
                items={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                  { value: 'system', label: 'System' },
                ]}
                orientation="horizontal"
              />
            </div>

            <Separator class="my-4" />

            <div class="form-row">
              <div class="form-row-label">
                <span>Email Notifications</span>
                <span>Receive email about account activity.</span>
              </div>
              <Switch defaultChecked />
            </div>
            <div class="form-row">
              <div class="form-row-label">
                <span>Marketing Emails</span>
                <span>Receive emails about new features and tips.</span>
              </div>
              <Switch />
            </div>
            <div class="form-row">
              <div class="form-row-label">
                <span>Push Notifications</span>
                <span>Get notified on your mobile device.</span>
              </div>
              <Switch defaultChecked />
            </div>

            <Separator class="my-4" />

            <div class="form-field" style={{ marginBottom: '1rem' }}>
              <Checkbox label="I agree to the Terms of Service" />
            </div>
            <div class="form-field">
              <Checkbox label="I want to receive the weekly newsletter" />
            </div>
          </CardContent>
        </Card>

        <Card class="mb-6">
          <CardHeader>
            <CardTitle>Accessibility</CardTitle>
            <CardDescription>Adjust display and interaction settings.</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="form-field" style={{ marginBottom: '1.5rem' }}>
              <Slider label="Font Size" defaultValue={[16]} min={12} max={24} step={1} />
            </div>

            <div class="form-grid">
              <div class="form-field">
                <NumberInput label="Line Height" defaultValue="1.5" min={1} max={3} step={0.1} />
              </div>
              <div class="form-field">
                <NumberInput label="Tab Size" defaultValue="4" min={2} max={8} step={2} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card class="mb-6">
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Protect your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="form-field" style={{ marginBottom: '1.5rem' }}>
              <PinInput
                label="Two-Factor Code"
                count={6}
                type="numeric"
                placeholder="○"
                onValueComplete={(d: any) => console.log('PIN complete:', d.valueAsString)}
              />
            </div>

            <div class="form-field" style={{ marginBottom: '1.5rem' }}>
              <TagsInput
                label="Trusted IP Addresses"
                placeholder="Add IP..."
                defaultValue={['192.168.1.1', '10.0.0.1']}
              />
            </div>
          </CardContent>
        </Card>

        <Card class="mb-6">
          <CardHeader>
            <CardTitle>Documents</CardTitle>
            <CardDescription>Upload identity documents for verification.</CardDescription>
          </CardHeader>
          <CardContent>
            <FileUpload label="Upload Files" maxFiles={3} />
          </CardContent>
        </Card>

        <div class="form-actions">
          <Button variant="outline">Cancel</Button>
          <Button>Save Changes</Button>
        </div>
      </div>
    )
  }
}
