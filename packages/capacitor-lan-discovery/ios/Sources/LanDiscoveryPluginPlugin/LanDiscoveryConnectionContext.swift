import Foundation
import Network

struct ProbeOutcome {
    let connectable: Bool
    let error: String?
    let remoteDeviceId: String?
    let remoteDisplayName: String?
}

final class InboundConnectionContext {
    let connection: NWConnection
    let remote: String
    var sessionId: String?

    init(connection: NWConnection, remote: String) {
        self.connection = connection
        self.remote = remote
    }
}
