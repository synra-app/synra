import { WebPlugin } from '@capacitor/core'
import type {
  CloseSessionOptions,
  CloseSessionResult,
  GetSessionStateOptions,
  GetSessionStateResult,
  OpenSessionOptions,
  OpenSessionResult,
  ProbeSynraPeersOptions,
  ProbeSynraPeersResult,
  PullHostEventsResult,
  SendLanEventOptions,
  SendLanEventResult,
  SendMessageOptions,
  SendMessageResult,
  SessionSnapshot,
  DeviceConnectionPlugin
} from './definitions'

export class DeviceConnectionWeb extends WebPlugin implements DeviceConnectionPlugin {
  private sessionState: SessionSnapshot = {
    state: 'idle',
    transport: 'tcp'
  }

  async openSession(_options: OpenSessionOptions): Promise<OpenSessionResult> {
    throw this.unavailable('openSession is not supported on web fallback.')
  }

  async closeSession(_options: CloseSessionOptions = {}): Promise<CloseSessionResult> {
    this.sessionState = {
      ...this.sessionState,
      state: 'closed',
      closedAt: Date.now()
    }
    return {
      success: true,
      targetDeviceId: this.sessionState.deviceId,
      transport: 'tcp'
    }
  }

  async sendMessage(_options: SendMessageOptions): Promise<SendMessageResult> {
    throw this.unavailable('sendMessage is not supported on web fallback.')
  }

  async sendLanEvent(_options: SendLanEventOptions): Promise<SendLanEventResult> {
    throw this.unavailable('sendLanEvent is not supported on web fallback.')
  }

  async getSessionState(_options: GetSessionStateOptions = {}): Promise<GetSessionStateResult> {
    return this.sessionState
  }

  async pullHostEvents(): Promise<PullHostEventsResult> {
    return { events: [] }
  }

  async probeSynraPeers(_options: ProbeSynraPeersOptions): Promise<ProbeSynraPeersResult> {
    throw this.unavailable('probeSynraPeers is not supported on web fallback.')
  }
}
