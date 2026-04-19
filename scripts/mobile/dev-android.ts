import { spawn } from 'node:child_process'

function runStep(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child =
      process.platform === 'win32'
        ? spawn(`${command} ${args.join(' ')}`, {
            stdio: 'inherit',
            shell: true
          })
        : spawn(command, args, {
            stdio: 'inherit'
          })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(
        new Error(`Command failed: ${command} ${args.join(' ')} (exit code ${code ?? 'null'})`)
      )
    })
  })
}

const vpCommand = 'vp'

const steps: Array<{ title: string; command: string; args: string[] }> = [
  {
    title: 'Build frontend web assets',
    command: vpCommand,
    args: ['run', 'frontend#build']
  },
  {
    title: 'Sync Android project',
    command: vpCommand,
    args: ['run', 'mobile#sync:android']
  },
  {
    title: 'Open Android Studio project',
    command: vpCommand,
    args: ['run', 'mobile#open:android']
  }
]

for (const step of steps) {
  console.log(`\n==> ${step.title}`)
  await runStep(step.command, step.args)
}

console.log('\nAndroid dev flow completed.')
