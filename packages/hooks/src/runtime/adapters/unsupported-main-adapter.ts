import type { ConnectionRuntimeAdapter } from '../adapter'

function unsupportedError(): Error {
  return new Error(
    'useConnection is running in Electron main process without a runtime bridge. Configure a custom adapter via configureHooksRuntime(...) before using connection hooks in main.'
  )
}

export function createUnsupportedMainAdapter(): ConnectionRuntimeAdapter {
  return {
    async getDiscoveredDevices() {
      throw unsupportedError()
    },
    async startDiscovery() {
      throw unsupportedError()
    },
    async stopDiscovery() {
      throw unsupportedError()
    },
    async probeConnectable() {
      throw unsupportedError()
    },
    async openSession() {
      throw unsupportedError()
    },
    async closeSession() {
      throw unsupportedError()
    },
    async sendMessage() {
      throw unsupportedError()
    },
    async getSessionState() {
      throw unsupportedError()
    },
    async pullHostEvents() {
      throw unsupportedError()
    },
    async addDeviceConnectableUpdatedListener() {
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
    }
  }
}
