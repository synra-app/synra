import Foundation
import Network

final class OutboundConnectionContext {
    let connection: NWConnection
    let host: String
    let port: UInt16
    let hostPortKey: String
    var sessionId: String
    let remoteLabel: String

    init(
        connection: NWConnection,
        host: String,
        port: UInt16,
        hostPortKey: String,
        sessionId: String,
        remoteLabel: String
    ) {
        self.connection = connection
        self.host = host
        self.port = port
        self.hostPortKey = hostPortKey
        self.sessionId = sessionId
        self.remoteLabel = remoteLabel
    }
}
