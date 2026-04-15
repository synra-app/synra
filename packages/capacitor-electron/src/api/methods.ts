import { BRIDGE_METHODS } from "../shared/protocol/constants";

export const API_METHODS = {
  getRuntimeInfo: BRIDGE_METHODS.runtimeGetInfo,
  openExternal: BRIDGE_METHODS.externalOpen,
  readFile: BRIDGE_METHODS.fileRead,
} as const;
