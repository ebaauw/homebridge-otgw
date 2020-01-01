// homebridge-otgw/lib/OtmClient.js
// Copyright © 2019-2020 Erik Baauw. All rights reserved.
//
// Homebridege plugin for OpenTherm Gateway.

'use strict'

const events = require('events')
const request = require('request')

const WebSocket = require('ws')

const maxRetries = 5

// Client to OpenTherm Monitor web server.
class OtmClient extends events.EventEmitter {
  constructor (options = {}) {
    super()
    this._host = options.hostname + ':' + options.port
    this._commandUri = 'http://' + this._host + '/command?'
    this._messageUri = 'ws://' + this._host + '/message.ws'
  }

  async connect () {
    return new Promise((resolve, reject) => {
      this._ws = new WebSocket(this._messageUri, { origin: 'localhost' })
      this._ws.once('open', () => { resolve(this._messageUri) })
      this._ws.once('error', (error) => { reject(error) })
      this._ws.on('message', (message) => {
        this.emit('message', message.substr(17))
      })
      this._ws.on('close', () => {
        delete this._ws
        this.emit('close')
      })
    })
  }

  close () {
    if (this._ws != null) {
      this._ws.close()
    }
  }

  // Send a command to the OTM and return its reponse.
  async command (command, retries = 0) {
    return new Promise((resolve, reject) => {
      this.emit('command', command, retries)
      request(this._commandUri + command, (error, response) => {
        if (error != null) {
          return reject(error)
        }
        const a = response.body.split(': ')
        if (a[0] === command.split('=')[0]) {
          this.emit('response', command, a[1])
          return resolve(a[1])
        }
        if (retries >= maxRetries) {
          return reject(new Error(
            `command ${command}: no response after ${retries} retries`
          ))
        }
        setTimeout(() => {
          return resolve(this.command(command, retries + 1))
        }, 1000)
      })
    })
  }
}

module.exports = OtmClient
