// homebridge-otgw/lib/OtgwClient.js
// Copyright © 2019 Erik Baauw. All rights reserved.
//
// Homebridege plugin for OpenTherm Gateway.

'use strict'

const events = require('events')
const net = require('net')

const maxRetries = 5

// Client to OpenTherm Gateway's NodeMCU serial server.
class OtgwClient extends events.EventEmitter {
  constructor (options = {}) {
    super()
    this._hostname = options.hostname
    this._port = options.port
  }

  async connect () {
    return new Promise((resolve, reject) => {
      this._socket = net.createConnection(this._port, this._hostname)
      this._socket.once('connect', () => {
        this._connected = true
        resolve(`${this._hostname}:${this._port}`)
      })
      this._socket.once('error', (error) => {
        this._connected = false
        reject(error)
      })
      let line = ''
      this._socket.on('data', (data) => {
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
      this._socket.on('end', () => {
        delete this._socket
        this.emit('close')
      })
    })
  }

  close () {
    if (this._socket) {
      this._socket.end()
      // Somehow this doesn't issue an 'end' event.
      delete this._socket
      this.emit('close')
    }
  }

  // Send a command to the OTGW and return its reponse
  async command (command, retries = 0) {
    return new Promise((resolve, reject) => {
      if (this._socket == null) {
        return reject(new Error(`command ${command}: connection closed`))
      }
      this.emit('command', command, retries)
      this._socket.write(command + '\r\n', () => {
        this.once('message', (message) => {
          const a = message.split(': ')
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
    })
  }
}

module.exports = OtgwClient
