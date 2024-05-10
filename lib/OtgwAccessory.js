// homebridge-otgw/lib/OtgwClient.js
// Copyright © 2019-2024 Erik Baauw. All rights reserved.
//
// Homebridege plugin for OpenTherm Gateway.

import { AccessoryDelegate } from 'homebridge-lib/AccessoryDelegate'
import { ServiceDelegate } from 'homebridge-lib/ServiceDelegate'
import 'homebridge-lib/ServiceDelegate/History'

import { OtgwService } from './OtgwService.js'

class OtgwAccessory extends AccessoryDelegate {
  constructor (platform, context) {
    const params = {
      name: context.name,
      id: 'OTGW-' + context.name.toUpperCase(),
      manufacturer: 'homebridge-otgw',
      model: context.model,
      firmware: context.version,
      category: platform.Accessory.Categories.Sensor
    }
    super(platform, params)

    this.context.name = context.name
    this.context.model = context.model
    this.context.version = context.version
    this.values.firmware = context.version

    this.otgwService = new OtgwService[context.name](this, { state: context.state })
    if (context.name === 'Thermostat') {
      this.manageLogLevel(this.otgwService.characteristicDelegate('logLevel'), true)
    } else {
      this.inheritLogLevel(platform.otgwAccessories.Thermostat)
    }
    if (context.name === 'Boiler') {
      this.leakService = new OtgwService.Leak(this, { state: context.state })
    }
    this.historyService = context.name === 'OutsideTemperature'
      /* eslint-disable indent */
      ? new ServiceDelegate.History(this, {
        temperatureDelegate: this.otgwService.characteristicDelegate('temperature')
      })
      /* eslint-enable indent */
      : new ServiceDelegate.History(this, {
        temperatureDelegate: this.otgwService.characteristicDelegate('temperature'),
        targetTemperatureDelegate: this.otgwService.characteristicDelegate('targetTemperature'),
        valvePositionDelegate: this.otgwService.characteristicDelegate('valvePosition')
      })
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

export { OtgwAccessory }
