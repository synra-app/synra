import { BRIDGE_ERROR_CODES, type BridgeErrorCode } from "./codes";

export type BridgeErrorDetails = {
  retryable?: boolean;
  supportedVersions?: string[];
  capabilityKey?: string;
  [key: string]: unknown;
};

export class BridgeError extends Error {
  public readonly code: BridgeErrorCode;
  public readonly details?: BridgeErrorDetails;

  public constructor(code: BridgeErrorCode, message: string, details?: BridgeErrorDetails) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
    this.details = details;
  }
}

export function toBridgeError(error: unknown): BridgeError {
  if (error instanceof BridgeError) {
    return error;
  }

  if (error instanceof Error) {
    return new BridgeError(BRIDGE_ERROR_CODES.internalError, error.message);
  }

  return new BridgeError(BRIDGE_ERROR_CODES.internalError, "Unexpected error.");
}
