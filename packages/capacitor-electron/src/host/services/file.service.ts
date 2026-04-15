import { resolve } from "node:path";
import { BridgeError } from "../../shared/errors/bridge-error";
import { BRIDGE_ERROR_CODES } from "../../shared/errors/codes";
import type { ReadFileResult } from "../../shared/protocol/types";
import type { FileSystemAdapter } from "../adapters/file-system.adapter";

export type FileServiceOptions = {
  allowedRoots?: string[];
};

export type FileService = {
  readFile(path: string, encoding?: BufferEncoding): Promise<ReadFileResult>;
};

export function createFileService(
  fileSystemAdapter: FileSystemAdapter,
  options: FileServiceOptions = {},
): FileService {
  return {
    async readFile(path: string, encoding: BufferEncoding = "utf-8"): Promise<ReadFileResult> {
      const absolutePath = resolve(path);
      const allowedRoots = options.allowedRoots?.map((rootPath) => resolve(rootPath)) ?? [];

      if (
        allowedRoots.length > 0 &&
        !allowedRoots.some((rootPath) => absolutePath.startsWith(rootPath))
      ) {
        throw new BridgeError(
          BRIDGE_ERROR_CODES.unauthorized,
          "Path is outside the allowed roots.",
        );
      }

      try {
        const content = await fileSystemAdapter.readFile(absolutePath, encoding);
        return { content, encoding };
      } catch {
        throw new BridgeError(
          BRIDGE_ERROR_CODES.notFound,
          "File does not exist or cannot be read.",
        );
      }
    },
  };
}
