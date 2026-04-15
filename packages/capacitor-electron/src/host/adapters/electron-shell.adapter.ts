export type ShellAdapter = {
  openExternal(url: string): Promise<void>;
};

export function createShellAdapter(
  implementation: Pick<ShellAdapter, "openExternal"> = {
    async openExternal() {
      return;
    },
  },
): ShellAdapter {
  return {
    async openExternal(url: string): Promise<void> {
      await implementation.openExternal(url);
    },
  };
}
