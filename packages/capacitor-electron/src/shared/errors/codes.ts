export const BRIDGE_ERROR_CODES = {
  invalidParams: "INVALID_PARAMS",
  unauthorized: "UNAUTHORIZED",
  notFound: "NOT_FOUND",
  timeout: "TIMEOUT",
  unsupportedOperation: "UNSUPPORTED_OPERATION",
  internalError: "INTERNAL_ERROR",
} as const;

export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[keyof typeof BRIDGE_ERROR_CODES];
