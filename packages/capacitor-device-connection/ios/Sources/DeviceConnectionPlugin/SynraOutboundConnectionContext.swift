import Foundation
import Network

final class SynraOutboundConnectionContext {
    let connection: NWConnection
    let host: String
    let port: UInt16
    let hostPortKey: String
    let remoteLabel: String
    let remoteDeviceId: String
    let remoteDisplayName: String

    init(
        connection: NWConnection,
        host: String,
        port: UInt16,
        hostPortKey: String,
        remoteLabel: String,
        remoteDeviceId: String,
        remoteDisplayName: String
    ) {
        self.connection = connection
        self.host = host
        self.port = port
        self.hostPortKey = hostPortKey
        self.remoteLabel = remoteLabel
        self.remoteDeviceId = remoteDeviceId
        self.remoteDisplayName = remoteDisplayName
    }
}
