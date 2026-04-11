import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mobileDir = resolve(scriptDir, "..");
const frontendDistDir = resolve(mobileDir, "../frontend/dist");
const mobileWebDir = resolve(mobileDir, "www");

await rm(mobileWebDir, { force: true, recursive: true });
await mkdir(mobileWebDir, { recursive: true });
await cp(frontendDistDir, mobileWebDir, { force: true, recursive: true });

console.log(`Copied web assets from ${frontendDistDir} to ${mobileWebDir}`);
