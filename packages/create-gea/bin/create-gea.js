import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { intro, outro, text, select, confirm, isCancel, cancel, spinner } from '@clack/prompts'
import { cyan, gray, green, reset } from 'kolorist'

const __dirname = dirname(fileURLToPath(import.meta.url))
const templatesDir = resolve(__dirname, '../templates')

const TEMPLATES = [
  { value: 'default', label: 'Standard', hint: 'Simple Gea app with Vite' },
  { value: 'mobile', label: 'Mobile', hint: 'Gea mobile app with touch-friendly UI' },
  { value: 'dashboard', label: 'Dashboard', hint: 'Gea dashboard starter with layout' },
]

function isValidPackageName(value) {
  return /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(value)
}

function toValidPackageName(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]+/, '')
    .replace(/[^a-z0-9-~]+/g, '-')
    .replace(/-+/g, '-')
}

function getPackageManager() {
  const userAgent = process.env.npm_config_user_agent ?? ''
  if (userAgent.startsWith('pnpm/')) return 'pnpm'
  if (userAgent.startsWith('yarn/')) return 'yarn'
  if (userAgent.startsWith('bun/')) return 'bun'
  return 'npm'
}

function isEmptyDir(dir) {
  return !existsSync(dir) || readdirSync(dir).length === 0
}

function writeTemplateFile(projectRoot, fileName, replacements) {
  const filePath = resolve(projectRoot, fileName)
  if (!existsSync(filePath)) return
  const source = readFileSync(filePath, 'utf8')

  let next = source
  for (const [from, to] of Object.entries(replacements)) {
    next = next.replaceAll(from, to)
  }

  writeFileSync(filePath, next)
}

async function main() {
  intro(cyan('create-gea'))

  const args = process.argv.slice(2)
  let targetDir = args[0]

  if (!targetDir) {
    targetDir = await text({
      message: 'Project name:',
      placeholder: 'my-gea-app',
      defaultValue: 'my-gea-app',
      validate(value) {
        if (value && existsSync(resolve(process.cwd(), value)) && !isEmptyDir(resolve(process.cwd(), value))) {
          return 'Target directory is not empty'
        }
      },
    })
    if (isCancel(targetDir)) {
      cancel('Operation cancelled')
      process.exit(0)
    }
  }

  const projectRoot = resolve(process.cwd(), targetDir)

  const template = await select({
    message: 'Select a template:',
    options: TEMPLATES,
  })

  if (isCancel(template)) {
    cancel('Operation cancelled')
    process.exit(0)
  }

  const s = spinner()
  s.start(`Scaffolding project in ${gray(projectRoot)}...`)

  if (!existsSync(projectRoot)) {
    mkdirSync(projectRoot, { recursive: true })
  }

  const selectedTemplateDir = resolve(templatesDir, template)

  const templateToUse = existsSync(selectedTemplateDir) ? template : 'default'
  cpSync(resolve(templatesDir, templateToUse), projectRoot, { recursive: true })

  const gitignoreSource = resolve(projectRoot, '_gitignore')
  if (existsSync(gitignoreSource)) {
    renameSync(gitignoreSource, resolve(projectRoot, '.gitignore'))
  }

  const rawName = targetDir === '.' ? basename(process.cwd()) : basename(projectRoot)
  const packageName = isValidPackageName(rawName) ? rawName : toValidPackageName(rawName)

  writeTemplateFile(projectRoot, 'package.json', {
    __PACKAGE_NAME__: packageName,
  })
  writeTemplateFile(projectRoot, 'index.html', {
    __PROJECT_TITLE__: packageName,
  })

  s.stop(green(`Success! Project scaffolded in ${targetDir}`))

  const packageManager = getPackageManager()
  const installCommand = packageManager === 'yarn' ? 'yarn' : `${packageManager} install`
  const devCommand = packageManager === 'yarn' ? 'yarn dev' : `${packageManager} run dev`

  outro(`Next steps:
  ${targetDir !== '.' ? `cd ${targetDir}\n  ` : ''}${installCommand}\n  ${devCommand}
  `)
}

main().catch((error) => {
  cancel(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
