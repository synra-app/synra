import { BRIDGE_METHODS, BRIDGE_PROTOCOL_VERSION } from "../protocol/constants";
import type { BridgeRequest, BridgeResponse } from "../protocol/types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isBridgeRequest(value: unknown): value is BridgeRequest {
  if (!isObject(value)) {
    return false;
  }

  if (typeof value.protocolVersion !== "string") {
    return false;
  }

  if (typeof value.requestId !== "string" || value.requestId.length === 0) {
    return false;
  }

  if (typeof value.method !== "string" || value.method.length === 0) {
    return false;
  }

  return "payload" in value;
}

export function isBridgeResponse(value: unknown): value is BridgeResponse {
  if (!isObject(value)) {
    return false;
  }

  if (typeof value.requestId !== "string") {
    return false;
  }

  if (value.ok === true) {
    return "data" in value;
  }

  if (value.ok === false) {
    return (
      isObject(value.error) &&
      typeof value.error.code === "string" &&
      typeof value.error.message === "string"
    );
  }

  return false;
}

export function isSupportedProtocolVersion(protocolVersion: string): boolean {
  return protocolVersion === BRIDGE_PROTOCOL_VERSION;
}

export function isSupportedMethod(method: string): boolean {
  return (
    method === BRIDGE_METHODS.runtimeGetInfo ||
    method === BRIDGE_METHODS.externalOpen ||
    method === BRIDGE_METHODS.fileRead
  );
}

export function validateExternalOpenPayload(payload: unknown): payload is { url: string } {
  return isObject(payload) && typeof payload.url === "string" && payload.url.length > 0;
}

export function validateReadFilePayload(
  payload: unknown,
): payload is { path: string; encoding?: BufferEncoding } {
  if (!isObject(payload) || typeof payload.path !== "string" || payload.path.length === 0) {
    return false;
  }

  if (payload.encoding === undefined) {
    return true;
  }

  return typeof payload.encoding === "string";
}
