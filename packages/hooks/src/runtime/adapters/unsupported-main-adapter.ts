import type { OpenSessionOptions } from '@synra/capacitor-device-connection'
import type { ConnectionRuntimeAdapter } from '../adapter'

function unsupportedError(): Error {
  return new Error(
    'useTransport is running in Electron main process without a runtime bridge. Configure a custom adapter via configureHooksRuntime(...) before using transport hooks in main.'
  )
}

export function createUnsupportedMainAdapter(): ConnectionRuntimeAdapter {
  return {
    async startDiscovery() {
      throw unsupportedError()
    },
    async listDiscoveredDevices() {
      throw unsupportedError()
    },
    async openSession(_options: OpenSessionOptions) {
      throw unsupportedError()
    },
    async closeSession() {
      throw unsupportedError()
    },
    async sendMessage() {
      throw unsupportedError()
    },
    async sendLanEvent() {
      throw unsupportedError()
    },
    async getSessionState() {
      throw unsupportedError()
    },
    async addDeviceConnectableUpdatedListener() {
      throw unsupportedError()
    },
    async addDeviceLostListener() {
      throw unsupportedError()
    },
    async addSessionOpenedListener() {
      throw unsupportedError()
    },
    async addSessionClosedListener() {
      throw unsupportedError()
    },
    async addMessageReceivedListener() {
      throw unsupportedError()
    },
    async addMessageAckListener() {
      throw unsupportedError()
    },
    async addTransportErrorListener() {
      throw unsupportedError()
    },
    async addLanWireEventReceivedListener() {
      throw unsupportedError()
    }
  }
}
