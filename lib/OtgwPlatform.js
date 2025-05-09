// homebridge-otgw/lib/OtgwPlatform.js
// Copyright © 2019-2025 Erik Baauw. All rights reserved.
//
// Homebridege plugin for OpenTherm Gateway.

import { once } from 'node:events'
import { createRequire } from 'node:module'

import { OptionParser } from 'homebridge-lib/OptionParser'
import { Platform } from 'homebridge-lib/Platform'

import { OtgwAccessory } from './OtgwAccessory.js'
import { OtgwClient } from './OtgwClient.js'
import { OtmClient } from './OtmClient.js'
import { OtgwMessageParser } from './OtgwMessageParser.js'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json')

class OtgwPlatform extends Platform {
  constructor (log, configJson, homebridge) {
    super(log, configJson, homebridge)
    this.config = {
      name: 'OTGW',
      hostname: 'localhost',
      port: 8080
    }
    const optionParser = new OptionParser(this.config, true)
    optionParser
      .hostKey()
      .hostKey('otgw', 'otgwHostname', 'otgwPort')
      .stringKey('name')
      .stringKey('platform')
      .on('userInputError', (message) => {
        this.warn('config.json: %s', message)
      })
    try {
      optionParser.parse(configJson)
    } catch (error) {
      this.fatal(error)
    }

    // Parser for OTGW messages.
    this.parser = new OtgwMessageParser()
    this.parser.on('error', (error) => { this.warn(error) })

    // Client for OpenTherm Gateway NodeMCU serial server.
    if (this.config.otgwHostname != null && this.config.otgwPort != null) {
      const otgwClientOptions = {
        hostname: this.config.otgwHostname,
        port: this.config.otgwPort
      }
      this.otgwClient = new OtgwClient(otgwClientOptions)
      this.otgwClient
        .on('error', (error) => { this.warn(error) })
        .on('data', (data) => { this.vdebug('data: %j', data) })
        .on('message', this.onMessage.bind(this))
        .on('command', (command, retry) => {
          this.debug('send command: %s%s', command, retry > 0 ? ' [' + retry + ']' : '')
        })
        .on('response', (command, response) => {
          this.debug('send command: %s, response: %s', command, response)
        })
        .on('close', () => {
          if (this.client != null) {
            this.log('connection to OpenTherm Gateway closed')
            delete this.client
          }
        })
    }

    // Client for OpenTherm monitor.
    const otmClientOptions = {
      hostname: this.config.hostname,
      port: this.config.port
    }
    this.otmClient = new OtmClient(otmClientOptions)
    this.otmClient
      .on('error', (error) => {
        if (error.request != null) {
          this.log(
            'request %d: %s %s', error.request.id,
            error.request.method, error.request.resouce
          )
          this.warn(
            'request %d: %s', error.request.id, error
          )
          return
        }
        this.warn(error)
      })
      .on('message', this.onMessage.bind(this))
      .on('command', (command, retry) => {
        this.debug('send command: %s%s', command, retry > 0 ? ' [' + retry + ']' : '')
      })
      .on('commandResponse', (command, response) => {
        this.debug('send command: %s, response: %s', command, response)
      })
      .on('request', (request) => {
        this.debug(
          'request %d: %s %s', request.id, request.method, request.resource
        )
        this.vdebug(
          'request %d: %s %s', request.id, request.method, request.url
        )
      })
      .on('response', (response) => {
        this.vdebug(
          'request %d: response: %j', response.request.id, response.body
        )
        this.debug(
          'request %d: %d %s', response.request.id,
          response.statusCode, response.statusMessage
        )
      })
      .on('close', () => {
        if (this.client != null) {
          this.log('connection to OpenTherm Monitor closed')
          delete this.client
        }
      })

    this.otgwAccessories = {}

    this.on('body', (message, body) => {
      this.debug('%s: %j', message, body)
      for (const service in this.otgwAccessories) {
        this.otgwAccessories[service].checkState(body, true)
      }
    })
    this._connectBeat = 0
    this.on('heartbeat', async (beat) => { await this.heartbeat(beat) })
    this.on('shutdown', () => { this.shutdown() })
  }

  async heartbeat (beat) {
    if (this.client == null) {
      if (this._connectBeat == null) {
        this._connectBeat = beat + 15
      } else if (beat === this._connectBeat) {
        delete this._connectBeat
        await this.connect()
      }
    } else if (this._summary != null) {
      if (this.loggingActive > 0) {
        this.loggingActive--
      } else if (!this.inHeartbeat) {
        this.inHeartbeat = true
        this.warn('logging seems to be disabled - re-enabling...')
        try {
          await this.client.command('PS=0') // Resume logging
        } catch (error) {
          this.warn(error)
        }
        this.inHeartbeat = false
      }
    }
  }

  shutdown () {
    if (this.client != null) {
      this.client.close()
    }
  }

  async init () {
    if (this.client == null) {
      return
    }
    try {
      if (this.model == null && this.version == null) {
        const response = await this.client.command('PR=A') // Print Report
        const idString = response.split('=')[1]
        this.log(idString)
        const a = idString.split(' ')
        this.version = a.pop()
        this.model = a.join(' ')
        if (this.version !== packageJson.engines.otgw) {
          this.warn(
            'recommended version: OpenTherm Gateway v%s',
            packageJson.engines.otgw
          )
        }
      }
      const state = await this.summary()
      for (const accessory of ['Thermostat', 'Boiler', 'HotWater', 'OutsideTemperature']) {
        const context = {
          name: accessory,
          model: this.model,
          version: this.version,
          state
        }
        const otgwAccessory = new OtgwAccessory(this, context)
        this.otgwAccessories[accessory] = otgwAccessory
        this.otgwAccessories[accessory].checkState(state)
      }
    } catch (error) {
      this.warn(error)
      return
    }
    this._state = 'T'
    this.debug('initialised')
    this.emit('initialised')
  }

  async connect () {
    try {
      this.log('connecting to OpenTherm Monitor...')
      const host = await this.otmClient.connect()
      this.log('connected to OpenTherm Monitor at %s', host)
      this.client = this.otmClient
      return await this.init()
    } catch (error) {
      this.warn(error)
    }
    if (this.config.otgwHostname == null || this.config.otgwPort == null) {
      return
    }
    try {
      this.log('connecting to OpenTherm Gateway...')
      const host = await this.otgwClient.connect()
      this.log('connected to OpenTherm Gateway at %s', host)
      this.client = this.otgwClient
      return await this.init()
    } catch (error) {
      this.warn(error)
    }
  }

  async summary () {
    delete this._summary
    await this.client.command('PS=1') // Print Summary
    if (this._summary == null) {
      await once(this, 'summary')
    }
    await this.client.command('PS=0') // Resume logging
    return this._summary
  }

  async priorityMessage (id) {
    // todo: set timeout
    if (this._idP != null) {
      return Promise.reject(new Error('other priority message pending'))
    }
    this._idP = ('00' + id.toString(16)).slice(-2)
    await this.client.command('PM=' + id) // Priority Message
    const a = await once(this, 'priority')
    const body = a[1]
    delete this._idP
    return body
  }

  onMessage (message) {
    this.vdebug('message: %s', message)
    if (this.parser.isOtMessage(message)) {
      this.loggingActive = 5
      const m = this.parser.parseOtMessage(message)
      if (m == null) {
        this.warn('%s: ignore invalid OpenTherm message', message)
        return
      }
      if (m.origin === 'T') {
        // Request by thermostat.
        if (this._state !== 'T' && this._state !== 'TA') {
          this.warn('%s: out of sequence OpenTherm message - reset sequence', m.message)
        }
        if (m.type === this.parser.messageTypes.WRITE_DATA) {
          this.emit('body', m.message, m.body)
        }
        this._idT = m.id
        this._typeT = m.type
        this._state = 'RB'
        return
      }
      if (m.origin === 'R' && this._state === 'RB') {
        // Subsibute request by OTGW (as master) to boiler.
        this._idR = m.id
        this._typeR = m.type
        this._state = 'B'
        return
      }
      if (m.origin === 'B' && this._state === 'RB' && m.id === this._idT) {
        // Response from boiler to T.
        if (
          m.type === this.parser.messageTypes.DATA_INVALID ||
          m.type === this.parser.messageTypes.UNKNOWN_DATAID
        ) {
          this._state = 'TA'
          return
        }
        if (m.type === this.parser.messageTypes.READ_ACK) {
          this.emit('body', m.message, m.body)
        }
        this._state = 'T'
        return
      }
      if (m.origin === 'B' && this._state === 'B' && m.id === this._idR) {
        // Response from boiler to R.
        if (m.id === this._idP) {
          this.debug('priority: %s: %j', m.message, m.body)
          this.emit('priority', m.message, m.body)
        }
        if (m.type === (this._typeR | 0x04)) {
          this.emit('body', m.message, m.body)
        }
        this._state = 'A'
        return
      }
      if (
        m.origin === 'A' && (this._state === 'A' || this._state === 'TA') &&
        m.id === this._idT
      ) {
        // Subsitute response from OTGW to T.
        if (m.type === this.parser.messageTypes.READ_ACK && m.id !== this._idR) {
          this.emit('body', m.message, m.body)
        }
        this._state = 'T'
        return
      }
      this.warn('%s: ignore out of sequence OpenTherm message', m.message)
      this._state = 'T'
    } else if (this.parser.isSummary(message)) {
      const body = this.parser.parseSummary(message)
      if (body == null) {
        this.warn('%s: ignore invalid summary message', message)
      } else {
        this._summary = body
        this.debug('summary: %j', body)
        this.emit('summary', body)
      }
    } else if (/^Command(?: \(.*\))?: /.test(message)) {
      // this.debug('command: %s', message.split(': ')[1])
    } else if (/^[A-Z]{2}: /.test(message)) {
      // this.debug('response: %s', message)
    } else if (/^Error 0[1-4]/.test(message)) {
      this.warn(message)
    } else if (/^.* power/.test(message)) {
      // this.debug(message)
    } else {
      this.warn('ignore unknown message %s', message)
    }
  }
}

export { OtgwPlatform }
