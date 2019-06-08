// homebridge-otgw/lib/OtgwClient.js
// Copyright © 2019 Erik Baauw. All rights reserved.
//
// Homebridege plugin for OpenTherm Gateway.

'use strict'

const homebridgeLib = require('hblib')
const OtgwService = require('./OtgwService')

class OtgwAccessory extends homebridgeLib.AccessoryDelegate {
  constructor (platform, context) {
    const params = {
      name: context.name,
      id: 'OTGW-' + context.name.toUpperCase(),
      manufacturer: 'homebridge-otgw',
      model: context.model,
      firmware: context.version,
      category: platform.Accessory.hap.Categories.Sensor
    }
    super(platform, params)

    this.context.name = context.name
    this.context.model = context.model
    this.context.version = context.version

    this.otgwService = new OtgwService[context.name](this)
    this.historyService = new homebridgeLib.ServiceDelegate.History.Thermo(
      this, params,
      this.otgwService.characteristicDelegate('temperature'),
      this.otgwService.characteristicDelegate('targetTemperature'),
      this.otgwService.characteristicDelegate('valvePosition')
    )
  }

  checkState (state) {
    this.otgwService.checkState(state)
  }
}

module.exports = OtgwAccessory
