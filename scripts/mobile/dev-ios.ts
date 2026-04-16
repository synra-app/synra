import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function runStep(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child =
      process.platform === "win32"
        ? spawn(`${command} ${args.join(" ")}`, {
            stdio: "inherit",
            shell: true,
          })
        : spawn(command, args, {
            stdio: "inherit",
          });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(`Command failed: ${command} ${args.join(" ")} (exit code ${code ?? "null"})`),
      );
    });
  });
}

const vpCommand = "vp";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const iosProjectDir = resolve(scriptDir, "../../apps/mobile/ios");

try {
  await access(iosProjectDir);
} catch {
  console.error("iOS platform is not added yet. Run `vp exec cap add ios` in apps/mobile first.");
  process.exit(1);
}

const steps: Array<{ title: string; command: string; args: string[] }> = [
  {
    title: "Sync iOS project",
    command: vpCommand,
    args: ["run", "mobile#sync:ios"],
  },
  {
    title: "Open Xcode project",
    command: vpCommand,
    args: ["run", "mobile#open:ios"],
  },
];

for (const step of steps) {
  console.log(`\n==> ${step.title}`);
  await runStep(step.command, step.args);
}

console.log("\niOS dev flow completed.");
