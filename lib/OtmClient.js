// homebridge-otgw/lib/OtmClient.js
// Copyright © 2019-2026 Erik Baauw. All rights reserved.
//
// Homebridege plugin for OpenTherm Gateway.

import WebSocket from 'ws'

import { timeout } from 'homebridge-lib'
import { HttpClient } from 'homebridge-lib/HttpClient'

const maxRetries = 5

// Client to OpenTherm Monitor web server.
class OtmClient extends HttpClient {
  constructor (params = {}) {
    const host = params.hostname + ':' + params.port
    super({
      host,
      keepAlive: true,
      logger: params.logger,
      maxSockets: 1,
      text: true
    })
    this._host = host
    this._messageUri = 'ws://' + this._host + '/message.ws'
  }

  async connect () {
    // Somehow, events.once(this._ws, 'open') doesn't work as expected, when an
    // 'error' event is emitted.  Probably because ws library handles events
    // in a funny way.  For now, use traditional promise to handle this.
    return new Promise((resolve, reject) => {
      this._ws = new WebSocket(this._messageUri, { origin: 'localhost' })
      this._ws
        .on('message', (message, isBinary) => {
          this.emit('message', message.toString().slice(17))
        })
        .on('close', () => {
          if (this._ws != null) {
            this._ws.removeAllListeners()
          }
          delete this._ws
          this.emit('close')
        })
        .once('error', (error) => {
          // 'close' event will follow, so no cleanup here.
          reject(error)
        })
        .once('open', () => {
          this._ws.removeAllListeners('error')
          this._ws.on('error', (error) => {
            this.emit('error', error)
          })
          resolve(this._messageUri)
        })
    })
  }

  close () {
    if (this._ws != null) {
      this._ws.close()
    }
  }

  // Send a command to the OTM and return its reponse.
  async command (command) {
    for (let retry = 0; retry <= maxRetries; retry++) {
      this.debug('send command: %s%s', command, retry > 0 ? ' [' + retry + ']' : '')
      const response = await this.get('/command?' + command)
      const a = response.body.split(': ')
      if (a[0] === command.split('=')[0]) {
        this.debug('send command: %s, response: %s', command, response.body)
        return a[1]
      }
      await timeout(1000)
    }
    throw new Error(
      `command ${command}: no response after ${maxRetries} retries`
    )
  }
}

export { OtmClient }
