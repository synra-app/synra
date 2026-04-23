import Foundation

extension LanDiscoveryPlugin {
    func startUdpDiscoveryResponder() {
        if udpResponderSocket >= 0 {
            return
        }
        let socketFd = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        guard socketFd >= 0 else {
            return
        }
        var reuseFlag: Int32 = 1
        _ = setsockopt(
            socketFd,
            SOL_SOCKET,
            SO_REUSEADDR,
            &reuseFlag,
            socklen_t(MemoryLayout<Int32>.size)
        )
        var bindAddress = sockaddr_in()
        bindAddress.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        bindAddress.sin_family = sa_family_t(AF_INET)
        bindAddress.sin_port = CFSwapInt16HostToBig(udpDiscoveryPort)
        bindAddress.sin_addr = in_addr(s_addr: INADDR_ANY.bigEndian)
        let bindResult = withUnsafePointer(to: &bindAddress) { bindPointer in
            bindPointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
                bind(
                    socketFd,
                    sockaddrPointer,
                    socklen_t(MemoryLayout<sockaddr_in>.size)
                )
            }
        }
        guard bindResult == 0 else {
            close(socketFd)
            return
        }
        udpResponderSocket = socketFd
        let source = DispatchSource.makeReadSource(fileDescriptor: socketFd, queue: udpResponderQueue)
        source.setEventHandler { [weak self] in
            self?.handleUdpResponderRead(socketFd: socketFd)
        }
        source.setCancelHandler {
            close(socketFd)
        }
        udpResponderSource = source
        source.resume()
    }

    func stopUdpDiscoveryResponder() {
        udpResponderSource?.cancel()
        udpResponderSource = nil
        udpResponderSocket = -1
    }

    func handleUdpResponderRead(socketFd: Int32) {
        var buffer = [UInt8](repeating: 0, count: 256)
        var source = sockaddr_in()
        var sourceLength = socklen_t(MemoryLayout<sockaddr_in>.size)
        let receivedBytes = withUnsafeMutablePointer(to: &source) { sourcePointer in
            sourcePointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
                recvfrom(
                    socketFd,
                    &buffer,
                    buffer.count,
                    0,
                    sockaddrPointer,
                    &sourceLength
                )
            }
        }
        guard receivedBytes > 0 else {
            return
        }
        let payload = String(decoding: buffer.prefix(Int(receivedBytes)), as: UTF8.self).trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard payload == udpDiscoveryMagic else {
            return
        }
        let responseData = try? JSONSerialization.data(
            withJSONObject: [
                "appId": appId,
                "protocolVersion": protocolVersion,
                "port": Int(defaultTcpPort),
            ]
        )
        guard let responseData else {
            return
        }
        responseData.withUnsafeBytes { bytes in
            guard let rawPointer = bytes.baseAddress else {
                return
            }
            withUnsafePointer(to: &source) { sourcePointer in
                sourcePointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
                    _ = sendto(
                        socketFd,
                        rawPointer,
                        bytes.count,
                        0,
                        sockaddrPointer,
                        sourceLength
                    )
                }
            }
        }
    }
}
