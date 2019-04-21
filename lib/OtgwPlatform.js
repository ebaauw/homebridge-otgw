// homebridge-otgw/lib/OtgwPlatform.js
// Copyright © 2019 Erik Baauw. All rights reserved.
//
// Homebridege plugin for OpenTherm Gateway.

'use strict'

const homebridgeLib = require('homebridge-lib')
const OtgwAccessory = require('./OtgwAccessory')
const OtgwService = require('./OtgwService')
const OtgwClient = require('./OtgwClient')
const OtmClient = require('./OtmClient')
const OtgwMessageParser = require('./OtgwMessageParser')
const packageJson = require('../package.json')

module.exports = class OtgwPlatform extends homebridgeLib.Platform {
  constructor (log, configJson, homebridge) {
    super(log, configJson, homebridge)
    if (configJson == null) {
      return
    }
    this.config = {
      name: 'OTGW',
      hostname: 'localhost',
      port: 8080
    }
    const optionParser = new homebridgeLib.OptionParser(this.config, true)
    optionParser.hostKey()
    optionParser.hostKey('otgw', 'otgwHostname', 'otgwPort')
    optionParser.stringKey('name')
    optionParser.stringKey('platform')
    optionParser.on('usageError', (message) => {
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
      // this.otgwClient.on('data', (data) => { this.debug('data: %j', data) })
      this.otgwClient.on('message', this.onMessage.bind(this))
      this.otgwClient.on('command', (command, retry) => {
        this.debug('send command: %s%s', command, retry > 0 ? ' [' + retry + ']' : '')
      })
      this.otgwClient.on('response', (command, response) => {
        this.debug('send command: %s, response: %s', command, response)
      })
      this.otgwClient.on('error', (error) => { this.warn(error) })
      this.otgwClient.on('close', () => {
        this.log('connection to OpenTherm Gateway closed')
        delete this.client
      })
    }

    // Client for OpenTherm monitor.
    const otmClientOptions = {
      hostname: this.config.hostname,
      port: this.config.port
    }
    this.otmClient = new OtmClient(otmClientOptions)
    this.otmClient.on('message', this.onMessage.bind(this))
    this.otmClient.on('command', (command, retry) => {
      this.debug('send command: %s%s', command, retry > 0 ? ' [' + retry + ']' : '')
    })
    this.otmClient.on('response', (command, response) => {
      this.debug('send command: %s, response: %s', command, response)
    })
    this.otmClient.on('error', (error) => { this.warn(error) })
    this.otmClient.on('close', () => {
      if (this.client != null) {
        this.log('connection to OpenTherm Monitor closed')
        delete this.client
      }
    })

    this.otgwAccessories = {}

    this.on('accessoryRestored', this.accessoryRestored)
    this.on('body', (message, body) => {
      this.debug('%s: %j', message, body)
      for (const service in this.otgwAccessories) {
        this.otgwAccessories[service].checkState(body)
      }
    })
    this.on('heartbeat', this.heartbeat)
    this.on('shutdown', this.shutdown)
  }

  heartbeat (beat) {
    if (beat % 15 === 0 && this.client == null) {
      this.connect()
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
        const response = await this.client.command('PR=A') // Print id string
        const idString = response.split('=')[1]
        this.log(idString)
        const a = idString.split(' ')
        this.version = a.pop()
        this.model = a.join(' ')
        if (this.version !== packageJson.engines.otgw) {
          this.warn(
            'not using recommended OpenTherm Gateway version %s',
            packageJson.engines.otgw
          )
        }
      }
      if (Object.keys(this.otgwAccessories).length === 0) {
        let body = await this.priorityMessage(49) // Max CH setpoint boundaries
        this.log(
          'Boiler boundaries: min: %d, max: %d',
          body.max_ch_setpoint_min, body.max_ch_setpoint_max
        )
        OtgwService.setBoilerBoundaries({
          minValue: 10, maxValue: body.max_ch_setpoint_max
        })
        body = await this.priorityMessage(48) // DHW setpoint boundaries
        this.log(
          'HotWater boundaries: min: %d, max: %d',
          body.dhw_setpoint_min, body.dhw_setpoint_max
        )
        OtgwService.setHotWaterBoundaries({
          minValue: body.dhw_setpoint_min, maxValue: body.dhw_setpoint_max
        })
        for (const service of ['Thermostat', 'Boiler', 'HotWater']) {
          const context = {
            name: service,
            model: this.model,
            version: this.version
          }
          const otgwAccessory = new OtgwAccessory(this, context)
          this.otgwAccessories[service] = otgwAccessory
        }
      }
      const state = await this.client.command('PS=1') // Print Summary.
      for (const service in this.otgwAccessories) {
        this.otgwAccessories[service].checkState(state)
      }
      await this.client.command('PS=0') // Resume message logging.
    } catch (error) {
      this.warn(error.message)
    }
  }

  async connect () {
    try {
      this.debug(
        'connecting to OpenTherm Monitor at %s',
        this.config.hostname + ':' + this.config.port
      )
      const host = await this.otmClient.connect()
      this.log('connected to OpenTherm Monitor at %s', host)
      this.client = this.otmClient
      return await this.init()
    } catch (error) {
      this.error(error)
    }
    if (this.config.otgwHostname == null || this.config.otgwPort == null) {
      return
    }
    try {
      this.debug(
        'connecting to OpenTherm Gateway at %s',
        this.config.otgwHostname + ':' + this.config.otgwPort
      )
      const host = await this.otgwClient.connect()
      this.log('connected to OpenTherm Gateway at %s', host)
      this.client = this.otgwClient
      return await this.init()
    } catch (error) {
      this.error(error)
    }
  }

  async priorityMessage (id) {
    // todo: set timeout
    return new Promise(async (resolve, reject) => {
      if (this._idP != null) {
        return Promise.reject(new Error('other priority message pending'))
      }
      this._idP = ('00' + id.toString(16)).substr(-2)
      try {
        await this.client.command('PM=' + id) // Priority message
      } catch (error) {
        reject(error)
      }
      this.once('priority', (message, body) => {
        delete this._idP
        resolve(body)
      })
    })
  }

  onMessage (message) {
    // this.debug('message: %s', message)
    if (this.parser.isOtMessage(message)) {
      const m = this.parser.parseOtMessage(message)
      if (m == null) {
        this.warn('%s: ignore invalid OpenTherm message', message)
      } else if (m.origin === 'T' && this._idT == null && this._idR == null) {
        // Request by thermostat.
        this._idT = m.id
        this._typeT = m.type
      } else if (m.origin === 'R' && this._idT != null && this._idR == null) {
        // Subsibute request by OTGW (as master).
        this._idR = m.id
        this._typeR = m.type
      } else if (m.origin === 'B' && this._idT === m.id && this._idR == null) {
        // Response from boiler to T.
        if (this._typeT === (m.type & 0x03)) {
          this.emit('body', m.message, m.body)
        }
        delete this._idT
        delete this._typeT
      } else if (m.origin === 'B' && this._idR === m.id) {
        // Response from boiler to R.
        if (
          m.type === this.parser.messageTypes.READ_ACK &&
          m.id === this._idP
        ) {
          this.emit('priority', m.message, m.body)
        }
        if (this._typeR === (m.type & 0x03)) {
          this.emit('body', m.message, m.body)
        }
      } else if (m.origin === 'A' && this._idT === m.id && this._idR != null) {
        // Response from OTGW to T.
        if (this._typeT === (m.type & 0x03)) {
          this.emit('body', m.message, m.body)
        }
        delete this._idR
        delete this._typeR
        delete this._idT
        delete this._typeT
      } else {
        this.warn('%s: ignore out of sequence OpenTherm message', m.message)
        delete this._idR
        delete this._typeR
        delete this._idT
        delete this._typeT
      }
    } else if (this.parser.isSummary(message)) {
      const body = this.parser.parseSummary(message)
      if (body == null) {
        this.warn('%s: ignore invalid summary message', message)
      } else {
        this.emit('body', 'summary', body)
      }
    } else if (/^Command(?: \(.*\))?: /.test(message)) {
      this.debug('command: %s', message.split(': ')[1])
    } else if (/^[A-Z]{2}: /.test(message)) {
      const a = message.split(': ')
      this.debug('command: %s, reponse: %s', a[0], a[1])
    } else if (/^Error 0[1-4]/.test(message)) {
      this.warn(message)
    } else {
      this.warn('ignore unknown message %s', message)
    }
  }

  accessoryRestored (className, context) {
    const otgwAccessory = new OtgwAccessory(this, context)
    this.otgwAccessories[context.name] = otgwAccessory
  }
}
