import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access } from "node:fs/promises";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { styleText } from "node:util";
import type { Plugin } from "vite-plus";

type SpawnCommand = {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

const TAG_STYLES: Readonly<Record<string, Parameters<typeof styleText>[0]>> = {
  prebuild: "cyan",
  frontend: "green",
  "electron-build": "magenta",
  electron: "blue",
  error: "red",
  info: "dim",
};

const DEFAULT_TAG_STYLES: ReadonlyArray<Parameters<typeof styleText>[0]> = [
  "cyan",
  "green",
  "magenta",
  "blue",
  "yellow",
];
const LEADING_TAG_RE = /^\s*\[[^\]]+\]\s/;

function stripLeadingAnsi(text: string): string {
  let cursor = 0;
  while (text.charCodeAt(cursor) === 27 && text[cursor + 1] === "[") {
    const ansiEnd = text.indexOf("m", cursor + 2);
    if (ansiEnd === -1) {
      break;
    }
    cursor = ansiEnd + 1;
  }

  return text.slice(cursor);
}

function getTagStyle(tag: string): Parameters<typeof styleText>[0] {
  const mappedStyle = TAG_STYLES[tag];
  if (mappedStyle) {
    return mappedStyle;
  }

  const hash = Array.from(tag).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return DEFAULT_TAG_STYLES[hash % DEFAULT_TAG_STYLES.length] ?? "white";
}

function formatTag(tag: string): string {
  return styleText(getTagStyle(tag), `[${tag}]`);
}

function logWithTag(tag: string, message: string, type: "stdout" | "stderr" = "stdout"): void {
  const stream = type === "stderr" ? process.stderr : process.stdout;
  stream.write(`${formatTag(tag)} ${message}\n`);
}

function pipeWithTag(
  child: ChildProcessWithoutNullStreams,
  tag: string,
  type: "stdout" | "stderr",
): void {
  const source = type === "stderr" ? child.stderr : child.stdout;
  const target = type === "stderr" ? process.stderr : process.stdout;

  source.on("data", (chunk) => {
    const text = String(chunk);
    const prefix = `${formatTag(tag)} `;
    const lines = text.split(/(\r?\n)/);
    const taggedText = lines
      .map((segment) => {
        if (segment === "\n" || segment === "\r\n" || segment.length === 0) {
          return segment;
        }

        // Skip adding parent tag if child already emits "[tag]" prefix.
        if (LEADING_TAG_RE.test(stripLeadingAnsi(segment))) {
          return segment;
        }

        return `${prefix}${segment}`;
      })
      .join("");

    target.write(taggedText);
  });
}

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
  logWithTag(name, `start: ${command.command} ${command.args.join(" ")}`);

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
          detached: true,
          shell: false,
        });

  pipeWithTag(processToStart, name, "stdout");
  pipeWithTag(processToStart, name, "stderr");

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

  const { pid } = child;
  if (typeof pid !== "number") {
    child.kill("SIGTERM");
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }

  setTimeout(() => {
    if (child.killed || child.exitCode !== null) {
      return;
    }

    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }, 1500).unref();
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
  let quitting = false;
  const dependencyBuildProcesses: ChildProcessWithoutNullStreams[] = [];
  let frontendProcess: ChildProcessWithoutNullStreams | null = null;
  let buildWatchProcess: ChildProcessWithoutNullStreams | null = null;
  let electronRuntimeProcess: ChildProcessWithoutNullStreams | null = null;
  let restartTimer: NodeJS.Timeout | null = null;
  let restartInFlight: Promise<void> | null = null;
  let commandLineInterface: ReadlineInterface | null = null;
  let firstSuccessfulBuildReady = false;

  async function restartElectronRuntime(reason: "initial" | "rebuild"): Promise<void> {
    if (restartInFlight) {
      return restartInFlight;
    }

    restartInFlight = (async () => {
      logWithTag("electron", `restart requested (${reason})`);
      stopProcess(electronRuntimeProcess);

      if (!firstSuccessfulBuildReady) {
        logWithTag("info", "waiting for frontend and build outputs to be ready");
        await Promise.all([
          waitForHttpReady(frontendDevUrl),
          ...waitForPaths.map((path) => waitForFileReady(path)),
        ]);
        firstSuccessfulBuildReady = true;
        logWithTag("info", "startup prerequisites ready");
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
    })()
      .catch((error) => {
        logWithTag("error", String(error), "stderr");
      })
      .finally(() => {
        restartInFlight = null;
      });

    return restartInFlight;
  }

  function scheduleRestart(reason: "initial" | "rebuild"): void {
    if (restartTimer) {
      clearTimeout(restartTimer);
    }

    restartTimer = setTimeout(() => {
      void restartElectronRuntime(reason);
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
    electronRuntimeProcess = null;
    buildWatchProcess = null;
    frontendProcess = null;
    dependencyBuildProcesses.length = 0;
    started = false;
  }

  function teardownInteractiveCommands(): void {
    if (!commandLineInterface) {
      return;
    }

    commandLineInterface.close();
    commandLineInterface = null;
  }

  function setupInteractiveCommands(onQuit: () => void): void {
    if (!process.stdin.isTTY || commandLineInterface) {
      return;
    }

    commandLineInterface = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    logWithTag("info", "commands: r + Enter (restart electron), q + Enter (quit)");

    commandLineInterface.on("line", (line) => {
      const command = line.trim().toLowerCase();
      if (command === "r") {
        void restartElectronRuntime("rebuild");
        return;
      }

      if (command !== "q") {
        if (command.length > 0) {
          logWithTag("info", `unknown command: ${command}`);
        }
        return;
      }

      if (quitting) {
        return;
      }

      quitting = true;
      logWithTag("info", "quit requested, shutting down child processes");
      teardownInteractiveCommands();
      cleanup();
      onQuit();
    });
  }

  return {
    name: "vite-plugin-synra-electron",
    apply: "serve",
    configureServer(server) {
      if (started) {
        return;
      }

      started = true;
      setupInteractiveCommands(() => {
        const exitProcess = () => {
          setTimeout(() => {
            process.exit(0);
          }, 200).unref();
        };

        server.httpServer?.close(() => {
          exitProcess();
        });
        if (!server.httpServer) {
          exitProcess();
        }
      });

      void (async () => {
        try {
          if (prebuildCommand) {
            await runCommandAndWait(prebuildCommand, "prebuild");
          }

          if (options.startFrontendDevServer ?? true) {
            const frontendAlreadyRunning = await canReachHttp(frontendDevUrl);
            if (frontendAlreadyRunning) {
              logWithTag("frontend", `reuse existing server: ${frontendDevUrl}`);
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
              const reason: "initial" | "rebuild" = firstSuccessfulBuildReady
                ? "rebuild"
                : "initial";
              scheduleRestart(reason);
            }
          };
          buildWatchProcess.stdout.on("data", handleBuildOutput);
          buildWatchProcess.stderr.on("data", handleBuildOutput);
        } catch (error) {
          logWithTag("error", String(error), "stderr");
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
