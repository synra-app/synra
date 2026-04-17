import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const mobileDir = resolve(import.meta.dirname, "..");
const webDir = resolve(mobileDir, "www");
const indexFile = resolve(webDir, "index.html");

async function ensureCapacitorWebEntry(): Promise<void> {
  try {
    await access(indexFile, constants.F_OK);
    return;
  } catch {
    await mkdir(webDir, { recursive: true });
    await writeFile(
      indexFile,
      '<!doctype html><html><head><meta charset="UTF-8" /><title>Synra</title></head><body></body></html>\n',
      "utf8",
    );
    console.log("[cap] Created fallback web entry at apps/mobile/www/index.html");
  }
}

function runCapacitor(args: string[]): Promise<number> {
  const vpCommand = process.platform === "win32" ? "vp.cmd" : "vp";

  return new Promise((resolveExitCode, reject) => {
    const child = spawn(vpCommand, ["exec", "cap", ...args], {
      cwd: mobileDir,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => resolveExitCode(code ?? 1));
  });
}

const args = process.argv.slice(2);

await ensureCapacitorWebEntry();
const exitCode = await runCapacitor(args);
process.exit(exitCode);
