export class DesktopHandoffState {
  readonly pendingHandoffHosts = new Set<string>()

  readonly handoffOutboundSessionIdByHost = new Map<string, string>()
}
