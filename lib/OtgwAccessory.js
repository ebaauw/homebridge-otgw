// homebridge-otgw/lib/OtgwClient.js
// Copyright © 2019-2021 Erik Baauw. All rights reserved.
//
// Homebridege plugin for OpenTherm Gateway.

'use strict'

const homebridgeLib = require('homebridge-lib')
const OtgwService = require('./OtgwService')

class OtgwAccessory extends homebridgeLib.AccessoryDelegate {
  constructor (platform, context) {
    const params = {
      name: context.name,
      id: 'OTGW-' + context.name.toUpperCase(),
      manufacturer: 'homebridge-otgw',
      model: context.model,
      firmware: context.version,
      category: platform.Accessory.Categories.Sensor,
      inheritLogLevel: context.name !== 'Thermostat'
    }
    super(platform, params)

    this.context.name = context.name
    this.context.model = context.model
    this.context.version = context.version

    this.otgwService = new OtgwService[context.name](this, { state: context.state })
    if (context.name === 'Boiler') {
      this.leakService = new OtgwService.Leak(this, { state: context.state })
    }
    this.historyService = context.name === 'OutsideTemperature'
      /* eslint-disable indent */
      ? new homebridgeLib.ServiceDelegate.History.Weather(
        this, params,
        this.otgwService.characteristicDelegate('temperature')
      )
      /* eslint-enable indent */
      : new homebridgeLib.ServiceDelegate.History.Thermo(
        this, params,
        this.otgwService.characteristicDelegate('temperature'),
        this.otgwService.characteristicDelegate('targetTemperature'),
        this.otgwService.characteristicDelegate('valvePosition')
      )
    this.heartbeatEnabled = true
    setImmediate(() => {
      this.emit('initialised')
    })
  }

  checkState (state) {
    this.otgwService.checkState(state)
    if (this.leakService != null) {
      this.leakService.checkState(state)
    }
  }
}

module.exports = OtgwAccessory
