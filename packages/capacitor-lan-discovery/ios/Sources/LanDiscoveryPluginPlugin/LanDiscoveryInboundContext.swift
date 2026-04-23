import Foundation
import Network

final class InboundConnectionContext {
    let connection: NWConnection
    let remote: String
    var sessionId: String?

    init(connection: NWConnection, remote: String) {
        self.connection = connection
        self.remote = remote
    }
}
