import { BRIDGE_INVOKE_CHANNEL } from "../../shared/protocol/constants";
import type { BridgeResponse } from "../../shared/protocol/types";

export type IpcMainLike = {
  handle(
    channel: string,
    listener: (_event: unknown, request: unknown) => Promise<BridgeResponse>,
  ): void;
  removeHandler?(channel: string): void;
};

export type RegisterBridgeHandlersOptions = {
  allowReRegister?: boolean;
};

export function registerBridgeHandlers(
  ipcMainLike: IpcMainLike,
  dispatch: (request: unknown) => Promise<BridgeResponse>,
  options: RegisterBridgeHandlersOptions = {},
): void {
  if (options.allowReRegister && typeof ipcMainLike.removeHandler === "function") {
    ipcMainLike.removeHandler(BRIDGE_INVOKE_CHANNEL);
  }

  ipcMainLike.handle(BRIDGE_INVOKE_CHANNEL, async (_event, request) => dispatch(request));
}
