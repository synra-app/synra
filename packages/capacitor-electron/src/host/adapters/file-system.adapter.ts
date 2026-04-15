import { readFile } from "node:fs/promises";

export type FileSystemAdapter = {
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
};

export function createFileSystemAdapter(
  implementation: Pick<FileSystemAdapter, "readFile"> = {
    async readFile(filePath: string, encoding: BufferEncoding): Promise<string> {
      return readFile(filePath, { encoding });
    },
  },
): FileSystemAdapter {
  return {
    async readFile(path: string, encoding: BufferEncoding): Promise<string> {
      return implementation.readFile(path, encoding);
    },
  };
}
