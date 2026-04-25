import { WebPlugin } from '@capacitor/core'
import type {
  CloseTransportOptions,
  CloseTransportResult,
  GetTransportStateOptions,
  GetTransportStateResult,
  OpenTransportOptions,
  OpenTransportResult,
  ProbeSynraPeersOptions,
  ProbeSynraPeersResult,
  PullHostEventsResult,
  SendLanEventOptions,
  SendLanEventResult,
  SendMessageOptions,
  SendMessageResult,
  TransportSnapshot,
  DeviceConnectionPlugin
} from './definitions'

export class DeviceConnectionWeb extends WebPlugin implements DeviceConnectionPlugin {
  private transportState: TransportSnapshot = {
    state: 'idle',
    transport: 'tcp'
  }

  async openTransport(_options: OpenTransportOptions): Promise<OpenTransportResult> {
    throw this.unavailable('openTransport is not supported on web fallback.')
  }

  async closeTransport(_options: CloseTransportOptions = {}): Promise<CloseTransportResult> {
    this.transportState = {
      ...this.transportState,
      state: 'closed',
      closedAt: Date.now()
    }
    return {
      success: true,
      target: this.transportState.deviceId ?? '',
      transport: 'tcp'
    }
  }

  async sendMessage(_options: SendMessageOptions): Promise<SendMessageResult> {
    throw this.unavailable('sendMessage is not supported on web fallback.')
  }

  async sendLanEvent(_options: SendLanEventOptions): Promise<SendLanEventResult> {
    throw this.unavailable('sendLanEvent is not supported on web fallback.')
  }

  async getTransportState(
    _options: GetTransportStateOptions = {}
  ): Promise<GetTransportStateResult> {
    return this.transportState
  }

  async pullHostEvents(): Promise<PullHostEventsResult> {
    return { events: [] }
  }

  async probeSynraPeers(_options: ProbeSynraPeersOptions): Promise<ProbeSynraPeersResult> {
    throw this.unavailable('probeSynraPeers is not supported on web fallback.')
  }
}
