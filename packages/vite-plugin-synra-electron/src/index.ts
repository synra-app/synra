import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import type { Plugin } from "vite-plus";

type SpawnCommand = {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export type SynraElectronPluginOptions = {
  workspaceRoot?: string;
  electronCwd?: string;
  frontendDevUrl?: string;
  prebuildCommand?: SpawnCommand | false;
  startFrontendDevServer?: boolean;
  frontendDevCommand?: SpawnCommand;
  electronBuildCommand?: SpawnCommand;
  electronRuntimeCommand?: SpawnCommand;
  restartDebounceMs?: number;
  dependencyBuildCommands?: SpawnCommand[];
  waitForPaths?: string[];
};

function startCommand(command: SpawnCommand, name: string): ChildProcessWithoutNullStreams {
  const processToStart =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", command.command, ...command.args], {
          cwd: command.cwd,
          env: { ...process.env, ...command.env },
          stdio: "pipe",
          shell: false,
        })
      : spawn(command.command, command.args, {
          cwd: command.cwd,
          env: { ...process.env, ...command.env },
          stdio: "pipe",
          shell: false,
        });

  processToStart.stdout.on("data", (chunk) => {
    process.stdout.write(`[${name}] ${String(chunk)}`);
  });
  processToStart.stderr.on("data", (chunk) => {
    process.stderr.write(`[${name}] ${String(chunk)}`);
  });

  return processToStart;
}

async function runCommandAndWait(command: SpawnCommand, name: string): Promise<void> {
  const child = startCommand(command, name);

  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${name} exited with code ${String(code)}`));
    });
  });
}

async function waitForHttpReady(url: string, maxRetry = 60): Promise<void> {
  for (let retry = 0; retry < maxRetry; retry += 1) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return;
    } catch {
      await delay(500);
    }
  }

  throw new Error(`Failed to connect to frontend dev server: ${url}`);
}

async function canReachHttp(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);
    await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return true;
  } catch {
    return false;
  }
}

async function waitForFileReady(path: string, maxRetry = 120): Promise<void> {
  for (let retry = 0; retry < maxRetry; retry += 1) {
    try {
      await access(path);
      return;
    } catch {
      await delay(500);
    }
  }

  throw new Error(`Required file was not produced in time: ${path}`);
}

function stopProcess(child: ChildProcessWithoutNullStreams | null): void {
  if (!child || child.killed) {
    return;
  }

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      shell: false,
    });
    return;
  }

  child.kill("SIGTERM");
}

export function synraElectronPlugin(options: SynraElectronPluginOptions = {}): Plugin {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const electronCwd = options.electronCwd ?? process.cwd();
  const frontendDevUrl = options.frontendDevUrl ?? "http://localhost:5173";
  const restartDebounceMs = options.restartDebounceMs ?? 200;
  const prebuildCommand: SpawnCommand | false = options.prebuildCommand ?? {
    command: "vp",
    args: ["run", "capacitor-electron#build"],
    cwd: workspaceRoot,
  };

  const frontendDevCommand: SpawnCommand = options.frontendDevCommand ?? {
    command: "vp",
    args: ["run", "frontend#dev"],
    cwd: workspaceRoot,
  };
  const electronBuildCommand: SpawnCommand = options.electronBuildCommand ?? {
    command: "vp",
    args: ["exec", "tsc", "-p", "tsconfig.json", "--watch", "--preserveWatchOutput"],
    cwd: electronCwd,
  };
  const electronRuntimeCommand: SpawnCommand = options.electronRuntimeCommand ?? {
    command: "vp",
    args: ["exec", "electron", "./dist/src/main.js"],
    cwd: electronCwd,
    env: { VITE_DEV_SERVER_URL: frontendDevUrl },
  };
  const dependencyBuildCommands = options.dependencyBuildCommands ?? [];
  const waitForPaths = options.waitForPaths ?? [];

  let started = false;
  const dependencyBuildProcesses: ChildProcessWithoutNullStreams[] = [];
  let frontendProcess: ChildProcessWithoutNullStreams | null = null;
  let buildWatchProcess: ChildProcessWithoutNullStreams | null = null;
  let electronRuntimeProcess: ChildProcessWithoutNullStreams | null = null;
  let restartTimer: NodeJS.Timeout | null = null;
  let firstSuccessfulBuildReady = false;

  async function restartElectronRuntime(): Promise<void> {
    stopProcess(electronRuntimeProcess);

    if (!firstSuccessfulBuildReady) {
      await waitForHttpReady(frontendDevUrl);
      await Promise.all(waitForPaths.map((path) => waitForFileReady(path)));
      firstSuccessfulBuildReady = true;
    }

    electronRuntimeProcess = startCommand(
      {
        ...electronRuntimeCommand,
        env: {
          ...electronRuntimeCommand.env,
          VITE_DEV_SERVER_URL: frontendDevUrl,
        },
      },
      "electron",
    );
  }

  function scheduleRestart(): void {
    if (restartTimer) {
      clearTimeout(restartTimer);
    }

    restartTimer = setTimeout(() => {
      void restartElectronRuntime();
    }, restartDebounceMs);
  }

  function cleanup(): void {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }

    stopProcess(electronRuntimeProcess);
    stopProcess(buildWatchProcess);
    stopProcess(frontendProcess);
    dependencyBuildProcesses.forEach((processItem) => stopProcess(processItem));
  }

  return {
    name: "vite-plugin-synra-electron",
    apply: "serve",
    configureServer(server) {
      if (started) {
        return;
      }

      started = true;

      void (async () => {
        try {
          if (prebuildCommand) {
            await runCommandAndWait(prebuildCommand, "prebuild");
          }

          if (options.startFrontendDevServer ?? true) {
            const frontendAlreadyRunning = await canReachHttp(frontendDevUrl);
            if (frontendAlreadyRunning) {
              process.stdout.write(
                `[vite-plugin-synra-electron] Reusing existing frontend server: ${frontendDevUrl}\n`,
              );
            } else {
              frontendProcess = startCommand(frontendDevCommand, "frontend");
            }
          }

          dependencyBuildCommands.forEach((command, index) => {
            const processItem = startCommand(command, `dependency-build-${index + 1}`);
            dependencyBuildProcesses.push(processItem);
          });

          buildWatchProcess = startCommand(electronBuildCommand, "electron-build");
          const handleBuildOutput = (chunk: unknown) => {
            const text = String(chunk);
            if (
              /Found 0 errors?\./.test(text) ||
              /watch(ing)? for changes/i.test(text) ||
              /build finished/i.test(text)
            ) {
              scheduleRestart();
            }
          };
          buildWatchProcess.stdout.on("data", handleBuildOutput);
          buildWatchProcess.stderr.on("data", handleBuildOutput);
        } catch (error) {
          process.stderr.write(`[vite-plugin-synra-electron] ${String(error)}\n`);
          cleanup();
        }
      })();

      server.httpServer?.once("close", cleanup);
      process.once("SIGINT", cleanup);
      process.once("SIGTERM", cleanup);
      process.once("exit", cleanup);
    },
  };
}

export default synraElectronPlugin;
