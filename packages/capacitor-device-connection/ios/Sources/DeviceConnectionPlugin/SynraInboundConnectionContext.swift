import Foundation
import Network

final class SynraInboundConnectionContext {
    let connection: NWConnection
    let remote: String
    /// Set after a valid inbound `connect` frame; used for `sessionClosed` payloads.
    var canonicalDeviceId: String?

    init(connection: NWConnection, remote: String) {
        self.connection = connection
        self.remote = remote
    }
}
