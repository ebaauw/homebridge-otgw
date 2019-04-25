// homebridge-otgw/lib/OtgwClient.js
// Copyright © 2019 Erik Baauw. All rights reserved.
//
// Homebridege plugin for OpenTherm Gateway.

'use strict'

const homebridgeLib = require('homebridge-lib')
// const moment = require('moment')

let boilerBoundaries
let hotWaterBoundaries

class OtgwService extends homebridgeLib.ServiceDelegate {
  static setBoilerBoundaries (boundaries) {
    boilerBoundaries = boundaries
  }

  static setHotWaterBoundaries (boundaries) {
    hotWaterBoundaries = boundaries
  }

  constructor (otgwAccessory, params = {}) {
    params.name = otgwAccessory.name
    params.Service = otgwAccessory.Service.eve.Thermostat
    super(otgwAccessory, params)
  }

  static get Thermostat () {
    return class Thermostat extends OtgwService {
      constructor (otgwAccessory, params = {}) {
        super(otgwAccessory, params)
        this.characteristicDelegate('targetState')
          .on('didSet', this.onSetTargetState.bind(this))
        this.characteristicDelegate('targetTemperature')
          .on('didSet', this.onSetTargetTemperature.bind(this))
      }

      get characteristics () {
        return [
          {
            key: 'state',
            Characteristic: this.Characteristic.hap.CurrentHeatingCoolingState
          },
          {
            key: 'targetState',
            Characteristic: this.Characteristic.hap.TargetHeatingCoolingState,
            props: {
              validValues: [
                this.Characteristic.hap.TargetHeatingCoolingState.HEAT,
                this.Characteristic.hap.TargetHeatingCoolingState.AUTO
              ]
            }
          },
          {
            key: 'temperature',
            Characteristic: this.Characteristic.eve.CurrentTemperature,
            unit: '°C'
          },
          {
            key: 'targetTemperature',
            Characteristic: this.Characteristic.hap.TargetTemperature,
            unit: '°C',
            props: { minStep: 1 }
          },
          {
            key: 'temperatureUnit',
            Characteristic: this.Characteristic.hap.TemperatureDisplayUnits,
            value: this.Characteristic.hap.TemperatureDisplayUnits.CELSIUS
          },
          {
            key: 'valvePosition',
            Characteristic: this.Characteristic.eve.ValvePosition,
            unit: '%'
          }
        ]
      }

      checkState (state) {
        if (state.room_setpoint_remote_override != null) {
          this.context.override = state.room_setpoint_remote_override > 0
          if (this.context.override) {
            this.values.targetTemperature =
              Math.round(state.room_setpoint_remote_override * 10) / 10
          }
        }
        if (state.slave_status_ch_mode != null) {
          this.values.state = state.slave_status_ch_mode
            ? this.Characteristic.hap.CurrentHeatingCoolingState.HEAT
            : this.Characteristic.hap.CurrentHeatingCoolingState.OFF
        }
        if (state.master_status_ch_enable != null) {
          this.values.targetState = this.context.override
            ? this.Characteristic.hap.TargetHeatingCoolingState.HEAT
            : this.Characteristic.hap.TargetHeatingCoolingState.AUTO
        }
        if (state.room_temperature != null) {
          this.values.temperature = Math.round(state.room_temperature * 10) / 10
        }
        if (state.room_setpoint != null && !this.context.override) {
          this.values.targetTemperature = Math.round(state.room_setpoint * 10) / 10
        }
        if (state.max_reletive_modulation_setting != null) {
          this.values.valvePosition = state.max_reletive_modulation_setting
        }
        // this.values.lastupdated = String(new Date(moment.unix(observation.dt)))
        //   .substr(0, 24)
      }

      async onSetTargetState (value, fromHomeKit) {
        if (fromHomeKit && this.platform.client != null) {
          if (value === this.Characteristic.hap.TargetHeatingCoolingState.AUTO) {
            await this.platform.client.command('TT=0')
            this.context.override = false
          }
        }
      }

      async onSetTargetTemperature (value, fromHomeKit) {
        if (fromHomeKit && this.platform.client != null) {
          await this.platform.client.command('TT=' + value)
        }
      }
    }
  }

  static get Boiler () {
    return class Boiler extends OtgwService {
      get characteristics () {
        return [
          {
            key: 'state',
            Characteristic: this.Characteristic.hap.CurrentHeatingCoolingState
          },
          {
            key: 'targetState',
            Characteristic: this.Characteristic.hap.TargetHeatingCoolingState,
            props: {
              validValues: [
                this.Characteristic.hap.TargetHeatingCoolingState.OFF,
                this.Characteristic.hap.TargetHeatingCoolingState.HEAT
              ]
            }
          },
          {
            key: 'temperature',
            Characteristic: this.Characteristic.eve.CurrentTemperature,
            unit: '°C'
          },
          {
            key: 'targetTemperature',
            Characteristic: this.Characteristic.hap.TargetTemperature,
            unit: '°C',
            props: boilerBoundaries
          },
          {
            key: 'temperatureUnit',
            Characteristic: this.Characteristic.hap.TemperatureDisplayUnits,
            value: this.Characteristic.hap.TemperatureDisplayUnits.CELSIUS
          },
          {
            key: 'valvePosition',
            Characteristic: this.Characteristic.eve.ValvePosition,
            unit: '%'
          }
        ]
      }

      checkState (state) {
        if (state.slave_status_flame_status != null) {
          this.values.state = state.slave_status_flame_status
            ? this.Characteristic.hap.CurrentHeatingCoolingState.HEAT
            : this.Characteristic.hap.CurrentHeatingCoolingState.OFF
        }
        if (state.master_status_ch_enable != null) {
          this.values.targetState = state.master_status_ch_enable
            ? this.Characteristic.hap.TargetHeatingCoolingState.HEAT
            : this.Characteristic.hap.TargetHeatingCoolingState.OFF
        }
        if (state.boiler_water_temperature != null) {
          this.values.temperature = Math.round(state.boiler_water_temperature * 10) / 10
        }
        if (state.control_setpoint != null) {
          this.values.targetTemperature = Math.round(state.control_setpoint * 10) / 10
        }
        if (state.relative_modulation_level != null) {
          this.values.valvePosition = state.relative_modulation_level
        }
        // this.values.lastupdated = String(new Date(moment.unix(observation.dt)))
        //   .substr(0, 24)
      }
    }
  }

  static get HotWater () {
    return class HotWater extends OtgwService {
      constructor (otgwAccessory, params = {}) {
        super(otgwAccessory, params)
        this.characteristicDelegate('targetState')
          .on('didSet', this.onSetTargetState.bind(this))
        this.characteristicDelegate('targetTemperature')
          .on('didSet', this.onSetTargetTemperature.bind(this))
        this.accessoryDelegate.once('heartbeat', (beat) => {
          this.beat = (beat % 60) + 5
        })
        this.accessoryDelegate.on('heartbeat', this.onHeartbeat.bind(this))
      }

      get characteristics () {
        return [
          {
            key: 'state',
            Characteristic: this.Characteristic.hap.CurrentHeatingCoolingState
          },
          {
            key: 'targetState',
            Characteristic: this.Characteristic.hap.TargetHeatingCoolingState,
            props: {
              validValues: [
                this.Characteristic.hap.TargetHeatingCoolingState.OFF,
                this.Characteristic.hap.TargetHeatingCoolingState.HEAT,
                this.Characteristic.hap.TargetHeatingCoolingState.AUTO
              ]
            }
          },
          {
            key: 'temperature',
            Characteristic: this.Characteristic.eve.CurrentTemperature,
            unit: '°C'
          },
          {
            key: 'targetTemperature',
            Characteristic: this.Characteristic.hap.TargetTemperature,
            unit: '°C',
            props: hotWaterBoundaries
          },
          {
            key: 'temperatureUnit',
            Characteristic: this.Characteristic.hap.TemperatureDisplayUnits,
            value: this.Characteristic.hap.TemperatureDisplayUnits.CELSIUS
          },
          {
            key: 'valvePosition',
            Characteristic: this.Characteristic.eve.ValvePosition,
            unit: '%'
          }
        ]
      }

      checkState (state) {
        if (state.slave_status_dhw_mode != null) {
          this.values.state = state.slave_status_dhw_mode
            ? this.Characteristic.hap.CurrentHeatingCoolingState.HEAT
            : this.Characteristic.hap.CurrentHeatingCoolingState.OFF
          this.values.valvePosition = state.slave_status_dhw_mode ? 100 : 0
        }
        if (state.master_status_dhw_enable != null && !this.waiting) {
          this.values.targetState = this.context.override
            ? state.master_status_dhw_enable
              ? this.Characteristic.hap.TargetHeatingCoolingState.HEAT
              : this.Characteristic.hap.TargetHeatingCoolingState.OFF
            : this.Characteristic.hap.TargetHeatingCoolingState.AUTO
        }
        if (state.boiler_water_temperature != null) {
          this.values.temperature = Math.round(state.boiler_water_temperature * 10) / 10
        }
        if (state.dhw_setpoint != null) {
          this.values.targetTemperature = Math.round(state.dhw_setpoint * 10) / 10
        }
      }

      async onSetTargetState (value, fromHomeKit) {
        if (fromHomeKit && this.platform.client != null) {
          let command
          switch (value) {
            case this.Characteristic.hap.TargetHeatingCoolingState.OFF:
              command = 0
              break
            case this.Characteristic.hap.TargetHeatingCoolingState.HEAT:
              command = 1
              break
            case this.Characteristic.hap.TargetHeatingCoolingState.AUTO:
              command = 'A'
              break
          }
          this.waiting = true
          await this.platform.client.command('HW=' + command)
          this.context.override = command !== 'A'
          this.waiting = false
        }
      }

      async onSetTargetTemperature (value, fromHomeKit) {
        if (fromHomeKit && this.platform.client != null) {
          this.waitingTargetTemperature = true
          await this.platform.client.command('SW=' + value)
          this.waitingTargetTemperature = false
        }
      }

      async onHeartbeat (beat) {
        if (beat % 60 === this.beat && this.platform.client != null) {
          const hotWater = await this.platform.client.command('PR=W')
          this.context.override = hotWater !== 'W=A'
        }
      }
    }
  }
}

module.exports = OtgwService
