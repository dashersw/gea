#!/usr/bin/env node

import { Command } from 'commander'
import { intro, outro, select, text, spinner, confirm, isCancel, cancel } from '@clack/prompts'
import { cyan, green, yellow, gray } from 'kolorist'
import { execa } from 'execa'
import fs from 'fs-extra'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const program = new Command()

async function getProjectRoot() {
  let current = process.cwd()
  while (true) {
    if (await fs.pathExists(resolve(current, 'package.json'))) {
      const pkg = await fs.readJson(resolve(current, 'package.json'))
      if (pkg.dependencies?.['@geajs/core'] || pkg.devDependencies?.['@geajs/core']) {
        return current
      }
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

program
  .name('gea')
  .description('The command line interface for the Gea framework')
  .version('1.0.0')

program
  .command('init')
  .description('Scaffold a new Gea project')
  .argument('[project-name]', 'Name of the project')
  .action(async (name) => {
    intro(cyan('gea init'))

    try {
      if (!name) {
        name = await text({
          message: 'Project name:',
          placeholder: 'my-gea-app',
        })
        if (isCancel(name)) {
          cancel('Operation cancelled')
          process.exit(0)
        }
      }

      const s = spinner()
      s.start('Initalizing project...')

      await execa('npm', ['create', 'gea@latest', name], { stdio: 'inherit' })

      s.stop(green('Project initialized!'))
      outro(`Happy coding with ${cyan('Gea')}!`)
    } catch (e) {
      cancel(`Error: ${e.message}`)
      process.exit(1)
    }
  })

program
  .command('dev')
  .description('Launch the development server')
  .action(async () => {
    const root = await getProjectRoot()
    if (!root) {
      console.error(yellow('Not in a Gea project!'))
      process.exit(1)
    }

    await execa('npm', ['run', 'dev'], { stdio: 'inherit', cwd: root })
  })

program
  .command('add')
  .description('Add a new component or store to your project')
  .argument('<type>', 'Type of element: component|store')
  .argument('<name>', 'Name of the element')
  .action(async (type, name) => {
    const root = await getProjectRoot()
    if (!root) {
      console.error(yellow('Not in a Gea project!'))
      process.exit(1)
    }

    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
      console.error(yellow('Invalid name: path segments are not allowed'))
      process.exit(1)
    }

    const s = spinner()
    s.start(`Adding ${type} ${name}...`)

    const srcDir = resolve(root, 'src')
    if (!await fs.pathExists(srcDir)) {
      await fs.mkdirp(srcDir)
    }

    if (type === 'component') {
      const fileName = name.endsWith('.tsx') ? name : `${name}.tsx`
      const filePath = resolve(srcDir, fileName)

      const content = `import { Component } from '@geajs/core';

export default class ${name} extends Component {
  template() {
    return (
      <div class="${name.toLowerCase()}">
        <h2>Hello from ${name}</h2>
      </div>
    );
  }
}
`
      await fs.writeFile(filePath, content)
      s.stop(green(`Added component: ${gray(filePath)}`))
    } else if (type === 'store') {
      const fileName = name.endsWith('.ts') ? name : `${name}.ts`
      const filePath = resolve(srcDir, fileName)

      const content = `import { Store } from '@geajs/core';

export const ${name} = new Store({
  count: 0,
});
`
      await fs.writeFile(filePath, content)
      s.stop(green(`Added store: ${gray(filePath)}`))
    } else {
      s.stop(yellow(`Unknown type: ${type}`))
      process.exit(1)
    }
  })

program.parse()
