import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { access, readFile, writeFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { select } from '@inquirer/prompts'

let isShuttingDown = false
let activeChild: ChildProcess | null = null

function runStep(
  command: string,
  args: string[],
  cwd?: string,
  options?: { allowSignalInterrupt?: boolean }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child =
      process.platform === 'win32'
        ? spawn(`${command} ${args.join(' ')}`, {
            cwd,
            stdio: 'inherit',
            shell: true
          })
        : spawn(command, args, {
            cwd,
            stdio: 'inherit'
          })

    activeChild = child

    child.on('error', (error) => {
      if (activeChild === child) {
        activeChild = null
      }
      reject(error)
    })

    child.on('close', (code, signal) => {
      if (activeChild === child) {
        activeChild = null
      }

      if (code === 0) {
        resolve()
        return
      }

      if (options?.allowSignalInterrupt && signal && isShuttingDown) {
        resolve()
        return
      }

      reject(
        new Error(
          `Command failed: ${command} ${args.join(' ')} (exit code ${code ?? 'null'}, signal ${signal ?? 'null'})`
        )
      )
    })
  })
}

function runPersistentStep(command: string, args: string[]) {
  return process.platform === 'win32'
    ? spawn(`${command} ${args.join(' ')}`, {
        stdio: 'inherit',
        shell: true
      })
    : spawn(command, args, {
        stdio: 'inherit'
      })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitForServerReady(url: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // Keep retrying until timeout while the dev server starts.
    }

    await sleep(500)
  }

  throw new Error(`Timed out waiting for dev server: ${url}`)
}

async function isServerReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}

function resolveLiveReloadHost(): string {
  const interfaces = networkInterfaces()

  for (const entries of Object.values(interfaces)) {
    if (!entries) {
      continue
    }

    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address
      }
    }
  }

  return '127.0.0.1'
}

type SimulatorDevice = {
  udid: string
  name: string
  state: string
  isAvailable?: boolean
}

type SimulatorList = {
  devices: Record<string, SimulatorDevice[]>
}

type IosTargetChoice = {
  name: string
  value: string
  description: string
  booted: boolean
}

function listIosTargetChoices(): IosTargetChoice[] {
  const command = spawnSync('xcrun', ['simctl', 'list', 'devices', '--json'], {
    encoding: 'utf8'
  })

  if (command.status !== 0 || !command.stdout) {
    throw new Error('Failed to list iOS simulators via `xcrun simctl list devices --json`.')
  }

  let parsed: SimulatorList
  try {
    parsed = JSON.parse(command.stdout) as SimulatorList
  } catch {
    throw new Error('Failed to parse iOS simulator device list.')
  }

  const choices: IosTargetChoice[] = []
  for (const [runtime, devices] of Object.entries(parsed.devices)) {
    if (!runtime.includes('iOS')) {
      continue
    }

    for (const device of devices) {
      if (!device.isAvailable) {
        continue
      }

      const booted = device.state === 'Booted'
      const shortRuntime = runtime
        .replace('com.apple.CoreSimulator.SimRuntime.', '')
        .replaceAll('-', ' ')
      choices.push({
        name: `${device.name} (${booted ? 'booted' : 'shutdown'})`,
        value: device.udid,
        description: shortRuntime,
        booted
      })
    }
  }

  choices.sort((a, b) => {
    if (a.booted !== b.booted) {
      return a.booted ? -1 : 1
    }

    const aIsIphone = a.name.includes('iPhone')
    const bIsIphone = b.name.includes('iPhone')
    if (aIsIphone !== bIsIphone) {
      return aIsIphone ? -1 : 1
    }

    return a.name.localeCompare(b.name)
  })

  return choices
}

async function resolveIosTargetId(): Promise<string | null> {
  if (process.env.IOS_TARGET_ID) {
    return process.env.IOS_TARGET_ID
  }

  const choices = listIosTargetChoices()
  if (choices.length === 0) {
    return null
  }

  return select({
    message: 'Select iOS simulator target',
    choices,
    pageSize: 12
  })
}

async function configureIosLiveReload(configPath: string, liveReloadUrl: string): Promise<void> {
  try {
    await access(configPath)
  } catch {
    throw new Error(
      `Missing ${configPath}. Run \`vp run mobile#sync:ios\` once before \`dev:ios\`.`
    )
  }

  const currentConfigRaw = await readFile(configPath, 'utf8')
  const currentConfig = JSON.parse(currentConfigRaw) as Record<string, unknown>
  const serverConfig =
    typeof currentConfig.server === 'object' && currentConfig.server !== null
      ? (currentConfig.server as Record<string, unknown>)
      : {}

  const nextConfig: Record<string, unknown> = {
    ...currentConfig,
    server: {
      ...serverConfig,
      url: liveReloadUrl,
      cleartext: true
    }
  }

  await writeFile(configPath, `${JSON.stringify(nextConfig, null, '\t')}\n`, 'utf8')
}

const vpCommand = 'vp'
const scriptDir = dirname(fileURLToPath(import.meta.url))
const iosProjectDir = resolve(scriptDir, '../../apps/mobile/ios')
const mobileDir = resolve(scriptDir, '../../apps/mobile')
const iosCapConfigPath = resolve(scriptDir, '../../apps/mobile/ios/App/App/capacitor.config.json')
const devServerUrl = 'http://127.0.0.1:5173'
const liveReloadHost = resolveLiveReloadHost()
const liveReloadPort = '5173'
const liveReloadUrl = `http://${liveReloadHost}:${liveReloadPort}`

try {
  await access(iosProjectDir)
} catch {
  console.error('iOS platform is not added yet. Run `vp exec cap add ios` in apps/mobile first.')
  process.exit(1)
}

let devServer: ReturnType<typeof runPersistentStep> | null = null
let ownsDevServer = false

if (await isServerReady(devServerUrl)) {
  console.log(`\n==> Reuse existing frontend dev server at ${devServerUrl}`)
} else {
  console.log('\n==> Start frontend dev server')
  devServer = runPersistentStep(vpCommand, [
    'run',
    'frontend#dev',
    '--host',
    '0.0.0.0',
    '--port',
    liveReloadPort,
    '--strictPort'
  ])
  ownsDevServer = true
}

const shutdown = (signal: string) => {
  if (isShuttingDown) {
    return
  }

  isShuttingDown = true
  console.log(`\nReceived ${signal}. Stopping iOS live reload session...`)
  if (activeChild) {
    activeChild.kill('SIGINT')
  }
  if (devServer && ownsDevServer) {
    devServer.kill('SIGTERM')
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

if (devServer && ownsDevServer) {
  devServer.on('error', (error) => {
    throw error
  })

  devServer.on('exit', (code) => {
    if (isShuttingDown) {
      return
    }

    throw new Error(`Frontend dev server exited unexpectedly (code: ${code ?? 'null'}).`)
  })
}

console.log(`Waiting for dev server at ${devServerUrl} ...`)
await waitForServerReady(devServerUrl, 60_000)

console.log(`\n==> Configure iOS live reload URL: ${liveReloadUrl}`)
try {
  await configureIosLiveReload(iosCapConfigPath, liveReloadUrl)
} catch (error) {
  if (devServer && ownsDevServer) {
    devServer.kill('SIGTERM')
  }
  throw error
}

console.log('\n==> Select iOS simulator target')
const iosTargetId = await resolveIosTargetId()
if (!iosTargetId) {
  throw new Error('No available iOS simulator device found.')
}

console.log(`Selected target: ${iosTargetId}`)
console.log('\n==> Launch iOS simulator')
const stdinInterface = createInterface({
  input: process.stdin,
  output: process.stdout
})

stdinInterface.on('line', (line) => {
  if (line.trim().toLowerCase() === 'q') {
    shutdown('q')
  }
})

console.log('Type `q` then press Enter to stop.')
await runStep(
  vpCommand,
  [
    'exec',
    'cap',
    'run',
    'ios',
    '--live-reload',
    '--host',
    liveReloadHost,
    '--port',
    liveReloadPort,
    '--target',
    iosTargetId
  ],
  mobileDir,
  { allowSignalInterrupt: true }
)
stdinInterface.close()

shutdown('session end')
