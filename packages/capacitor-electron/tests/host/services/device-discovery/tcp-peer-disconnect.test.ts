import { describe, expect, test } from 'vite-plus/test'
import { isBenignTcpPeerDisconnect } from '../../../../src/host/services/device-discovery/core/tcp-peer-disconnect'

describe('isBenignTcpPeerDisconnect', () => {
  test('detects ECONNRESET by code', () => {
    const err = new Error('read ECONNRESET') as NodeJS.ErrnoException
    err.code = 'ECONNRESET'
    expect(isBenignTcpPeerDisconnect(err)).toBe(true)
  })

  test('detects read ECONNRESET message', () => {
    expect(isBenignTcpPeerDisconnect(new Error('read ECONNRESET'))).toBe(true)
  })

  test('detects EPIPE', () => {
    const err = new Error('write EPIPE') as NodeJS.ErrnoException
    err.code = 'EPIPE'
    expect(isBenignTcpPeerDisconnect(err)).toBe(true)
  })

  test('does not treat arbitrary errors as benign', () => {
    expect(isBenignTcpPeerDisconnect(new Error('certificate has expired'))).toBe(false)
  })
})
