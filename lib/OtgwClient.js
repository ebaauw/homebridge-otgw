// homebridge-otgw/lib/OtgwClient.js
// Copyright © 2019-2025 Erik Baauw. All rights reserved.
//
// Homebridege plugin for OpenTherm Gateway.

import { EventEmitter, once } from 'node:events'
import { createConnection } from 'node:net'

import { timeout } from 'homebridge-lib'

const maxRetries = 5

// Client to OpenTherm Gateway's NodeMCU serial server.
class OtgwClient extends EventEmitter {
  constructor (options = {}) {
    super()
    this._hostname = options.hostname
    this._port = options.port
  }

  async connect () {
    this._socket = createConnection(this._port, this._hostname)
    let line = ''
    this._socket
      .on('error', (error) => {
        this.emit(error, 'error')
        this.close()
      })
      .on('data', (data) => {
        this.emit('data', data)
        line += data.toString()
        const messages = line.split('\r\n')
        if (messages.length > 1) {
          line = messages.pop()
          for (const message of messages) {
            this.emit('message', message)
          }
        }
      })
      .on('end', () => { this.close() })
      .on('close', () => { this.close() })
    await once(this._socket, 'ready')
    return `${this._hostname}:${this._port}`
  }

  close () {
    if (this._socket) {
      if (!this._socket.destroyed) {
        this._socket.destroy()
      }
      this._socket.removeAllListeners()
      delete this._socket
      this.emit('close')
    }
  }

  // Send a command to the OTGW and return its reponse
  async command (command, retries = 0) {
    for (let retries = 0; retries <= maxRetries; retries++) {
      if (this._socket == null) {
        throw new Error(`command ${command}: connection closed`)
      }
      this.emit('command', command, retries)
      this._socket.write(command + '\r\n')
      const [message] = await once(this, 'message')
      const a = message.split(': ')
      if (a[0] === command.split('=')[0]) {
        this.emit('response', command, a[1])
        return a[1]
      }
      await timeout(1000)
    }
    throw new Error(
      `command ${command}: no response after ${maxRetries} retries`
    )
  }
}

export { OtgwClient }
