// homebridge-otgw/lib/OtgwClient.js
// Copyright © 2019-2020 Erik Baauw. All rights reserved.
//
// Homebridege plugin for OpenTherm Gateway.

'use strict'

const homebridgeLib = require('homebridge-lib')

class OtgwService extends homebridgeLib.ServiceDelegate {
  static get Thermostat () {
    return class Thermostat extends OtgwService {
      constructor (otgwAccessory, params = {}) {
        params.name = otgwAccessory.name
        params.Service = otgwAccessory.Services.eve.Thermostat
        super(otgwAccessory, params)
        this.addCharacteristicDelegate({
          key: 'state',
          Characteristic: this.Characteristics.hap.CurrentHeatingCoolingState
        })
        this.addCharacteristicDelegate({
          key: 'targetState',
          Characteristic: this.Characteristics.hap.TargetHeatingCoolingState,
          props: {
            validValues: [
              this.Characteristics.hap.TargetHeatingCoolingState.HEAT,
              this.Characteristics.hap.TargetHeatingCoolingState.AUTO
            ]
          }
        }).on('didSet', async (value, fromHomeKit) => {
          if (this.platform.client != null && fromHomeKit) {
            if (value === this.Characteristics.hap.TargetHeatingCoolingState.AUTO) {
              await this.platform.client.command('TT=0')
              this.context.override = false
            }
          }
        })
        this.addCharacteristicDelegate({
          key: 'temperature',
          Characteristic: this.Characteristics.eve.CurrentTemperature,
          unit: '°C'
        })
        this.addCharacteristicDelegate({
          key: 'targetTemperature',
          Characteristic: this.Characteristics.hap.TargetTemperature,
          unit: '°C',
          props: { minValue: 5, maxValue: 30, minStep: 1 }
        }).on('didSet', async (value, fromHomeKit) => {
          if (this.platform.client != null && fromHomeKit) {
            await this.platform.client.command('TT=' + value)
          }
        })
        this.addCharacteristicDelegate({
          key: 'temperatureUnit',
          Characteristic: this.Characteristics.hap.TemperatureDisplayUnits,
          value: this.Characteristics.hap.TemperatureDisplayUnits.CELSIUS
        })
        this.addCharacteristicDelegate({
          key: 'valvePosition',
          Characteristic: this.Characteristics.eve.ValvePosition,
          unit: '%'
        })
        this.addCharacteristicDelegate({
          key: 'programCommand',
          Characteristic: this.Characteristics.eve.ProgramCommand
        // }).on('didSet', (value) => {
        //   this.values.programData = value
        })
        this.addCharacteristicDelegate({
          key: 'programData',
          Characteristic: this.Characteristics.eve.ProgramData,
          value: Buffer.from('ff04f6', 'hex').toString('base64')
        })
        this.addCharacteristicDelegate({
          key: 'lastUpdated',
          Characteristic: this.Characteristics.my.LastUpdated,
          silent: true
        })
        this.addCharacteristicDelegate({
          key: 'logLevel',
          Characteristic: this.Characteristics.my.LogLevel,
          value: otgwAccessory.platform.logLevel
        }).on('didSet', (value) => {
          otgwAccessory.logLevel = value
        })
      }

      checkState (state) {
        let updated = false
        if (state.room_setpoint_remote_override != null) {
          this.context.override = state.room_setpoint_remote_override > 0
          if (this.context.override) {
            this.values.targetTemperature =
              Math.round(state.room_setpoint_remote_override * 10) / 10
          }
          updated = true
        }
        if (state.slave_status_ch_mode != null) {
          this.values.state = state.slave_status_ch_mode
            ? this.Characteristics.hap.CurrentHeatingCoolingState.HEAT
            : this.Characteristics.hap.CurrentHeatingCoolingState.OFF
          updated = true
        }
        if (state.master_status_ch_enable != null) {
          this.values.targetState = this.context.override
            ? this.Characteristics.hap.TargetHeatingCoolingState.HEAT
            : this.Characteristics.hap.TargetHeatingCoolingState.AUTO
        }
        if (state.room_temperature != null) {
          this.values.temperature = Math.round(state.room_temperature * 10) / 10
          updated = true
        }
        if (state.room_setpoint != null && !this.context.override) {
          this.values.targetTemperature = Math.round(state.room_setpoint * 10) / 10
          updated = true
        }
        if (state.max_relative_modulation_setting != null) {
          this.values.valvePosition = state.max_relative_modulation_setting
          updated = true
        }
        if (updated) {
          this.values.lastUpdated = String(new Date()).slice(0, 24)
        }
      }
    }
  }

  static get Boiler () {
    return class Boiler extends OtgwService {
      constructor (otgwAccessory, params = {}) {
        params.name = otgwAccessory.name
        params.Service = otgwAccessory.Services.eve.Thermostat
        super(otgwAccessory, params)

        if (params.state.max_ch_setpoint_min > 0 && params.state.max_ch_setpoint_max > 0) {
          this.log(
            'boundaries: min: %d°C, max: %d°C',
            params.state.max_ch_setpoint_min, params.state.max_ch_setpoint_max
          )
        } else {
          params.state.max_ch_setpoint_min = 20
          params.state.max_ch_setpoint_max = 80
        }

        this.addCharacteristicDelegate({
          key: 'state',
          Characteristic: this.Characteristics.hap.CurrentHeatingCoolingState
        })
        this.addCharacteristicDelegate({
          key: 'targetState',
          Characteristic: this.Characteristics.hap.TargetHeatingCoolingState,
          props: {
            validValues: [
              this.Characteristics.hap.TargetHeatingCoolingState.OFF,
              this.Characteristics.hap.TargetHeatingCoolingState.HEAT
            ]
          }
        })
        this.addCharacteristicDelegate({
          key: 'temperature',
          Characteristic: this.Characteristics.eve.CurrentTemperature,
          unit: '°C'
        })
        this.addCharacteristicDelegate({
          key: 'targetTemperature',
          Characteristic: this.Characteristics.hap.TargetTemperature,
          unit: '°C',
          props: {
            minValue: params.state.max_ch_setpoint_min,
            maxValue: params.state.max_ch_setpoint_max
          }
        })
        this.addCharacteristicDelegate({
          key: 'temperatureUnit',
          Characteristic: this.Characteristics.hap.TemperatureDisplayUnits,
          value: this.Characteristics.hap.TemperatureDisplayUnits.CELSIUS
        })
        this.addCharacteristicDelegate({
          key: 'valvePosition',
          Characteristic: this.Characteristics.eve.ValvePosition,
          unit: '%'
        })
        this.addCharacteristicDelegate({
          key: 'programCommand',
          Characteristic: this.Characteristics.eve.ProgramCommand
        // }).on('didSet', (value) => {
        //   this.values.programData = value
        })
        this.addCharacteristicDelegate({
          key: 'programData',
          Characteristic: this.Characteristics.eve.ProgramData,
          value: Buffer.from('ff04f6', 'hex').toString('base64')
        })
        this.addCharacteristicDelegate({
          key: 'lastUpdated',
          Characteristic: this.Characteristics.my.LastUpdated,
          silent: true
        })
        this.addCharacteristicDelegate({
          key: 'statusFault',
          Characteristic: this.Characteristics.hap.StatusFault
        })
      }

      checkState (state, fromBody) {
        let updated = false
        if (state.slave_status_flame_status != null) {
          this.values.state = state.slave_status_flame_status
            ? this.Characteristics.hap.CurrentHeatingCoolingState.HEAT
            : this.Characteristics.hap.CurrentHeatingCoolingState.OFF
          updated = true
        }
        if (state.master_status_ch_enable != null) {
          this.values.targetState = state.master_status_ch_enable
            ? this.Characteristics.hap.TargetHeatingCoolingState.HEAT
            : this.Characteristics.hap.TargetHeatingCoolingState.OFF
        }
        if (state.boiler_water_temperature != null) {
          this.values.temperature = Math.round(state.boiler_water_temperature * 10) / 10
          updated = true
        }
        if (state.control_setpoint != null) {
          this.values.targetTemperature = Math.round(state.control_setpoint * 10) / 10
          updated = true
        }
        if (state.relative_modulation_level != null) {
          this.values.valvePosition = state.relative_modulation_level
          updated = true
        }
        if (state.slave_status_fault != null) {
          this.values.statusFault = state.slave_status_fault
          updated = true
        }
        if (state.return_water_temperature != null && (fromBody || state.return_water_temperature > 0)) {
          if (this.values.returnWaterTemperature === undefined) {
            this.addCharacteristicDelegate({
              key: 'returnWaterTemperature',
              unit: '°C',
              Characteristic: this.Characteristics.my.ReturnWaterTemperature
            })
          }
          this.values.returnWaterTemperature = Math.round(state.return_water_temperature * 10) / 10
          updated = true
        }
        if (state.ch_water_pressure != null && (fromBody || state.ch_water_pressure > 0)) {
          if (this.values.waterPressure === undefined) {
            this.addCharacteristicDelegate({
              key: 'waterPressure',
              Characteristic: this.Characteristics.my.WaterPressure
            })
          }
          this.values.waterPressure = state.ch_water_pressure
          updated = true
        }
        if (state.burner_starts != null && (fromBody || state.burner_starts > 0)) {
          if (this.values.burnerStarts === undefined) {
            this.addCharacteristicDelegate({
              key: 'burnerStarts',
              Characteristic: this.Characteristics.my.BurnerStarts
            })
          }
          this.values.burnerStarts = state.burner_starts
          updated = true
        }
        if (state.ch_pump_starts != null && (fromBody || state.ch_pump_starts > 0)) {
          if (this.values.pumpStarts === undefined) {
            this.addCharacteristicDelegate({
              key: 'pumpStarts',
              Characteristic: this.Characteristics.my.PumpStarts
            })
          }
          this.values.pumpStarts = state.ch_pump_starts
          updated = true
        }
        if (state.burner_operation_hours != null && (fromBody || state.burner_operation_hours > 0)) {
          if (this.values.burnerHours === undefined) {
            this.addCharacteristicDelegate({
              key: 'burnerHours',
              Characteristic: this.Characteristics.my.BurnerHours
            })
          }
          this.values.burnerHours = state.burner_operation_hours
          updated = true
        }
        if (state.ch_pump_operation_hours != null && (fromBody || state.ch_pump_operation_hours > 0)) {
          if (this.values.pumpHours === undefined) {
            this.addCharacteristicDelegate({
              key: 'pumpHours',
              Characteristic: this.Characteristics.my.PumpHours
            })
          }
          this.values.pumpHours = state.ch_pump_operation_hours
          updated = true
        }
        if (updated) {
          this.values.lastUpdated = String(new Date()).slice(0, 24)
        }
      }
    }
  }

  static get HotWater () {
    return class HotWater extends OtgwService {
      constructor (otgwAccessory, params = {}) {
        params.name = otgwAccessory.name
        params.Service = otgwAccessory.Services.eve.Thermostat
        super(otgwAccessory, params)

        if (params.state.dhw_setpoint_min > 0 && params.state.dhw_setpoint_max > 0) {
          this.log(
            'boundaries: min: %d°C, max: %d°C',
            params.state.dhw_setpoint_min, params.state.dhw_setpoint_max
          )
        } else {
          params.state.dhw_setpoint_min = 40
          params.state.dhw_setpoint_max = 65
        }
        this.temperatureKey = params.state.dhw_temperature > 0
          ? 'dhw_temperature' : 'boiler_water_temperature'

        this.addCharacteristicDelegate({
          key: 'state',
          Characteristic: this.Characteristics.hap.CurrentHeatingCoolingState
        })
        this.addCharacteristicDelegate({
          key: 'targetState',
          Characteristic: this.Characteristics.hap.TargetHeatingCoolingState,
          props: {
            validValues: [
              this.Characteristics.hap.TargetHeatingCoolingState.OFF,
              this.Characteristics.hap.TargetHeatingCoolingState.HEAT,
              this.Characteristics.hap.TargetHeatingCoolingState.AUTO
            ]
          }
        }).on('didSet', async (value, byHomeKit) => {
          if (this.platform.client != null && byHomeKit) {
            let command
            switch (value) {
              case this.Characteristics.hap.TargetHeatingCoolingState.OFF:
                command = 0
                break
              case this.Characteristics.hap.TargetHeatingCoolingState.HEAT:
                command = 1
                break
              case this.Characteristics.hap.TargetHeatingCoolingState.AUTO:
                command = 'A'
                break
            }
            this.waiting = true
            await this.platform.client.command('HW=' + command)
            this.context.override = command !== 'A'
            this.waiting = false
          }
        })
        this.addCharacteristicDelegate({
          key: 'temperature',
          Characteristic: this.Characteristics.eve.CurrentTemperature,
          unit: '°C'
        })
        this.addCharacteristicDelegate({
          key: 'targetTemperature',
          Characteristic: this.Characteristics.hap.TargetTemperature,
          unit: '°C',
          props: {
            minValue: params.state.dhw_setpoint_min,
            maxValue: params.state.dhw_setpoint_max
          }
        }).on('didSet', async (value, byHomeKit) => {
          if (this.platform.client != null && byHomeKit) {
            this.waitingTargetTemperature = true
            await this.platform.client.command('SW=' + value)
            this.waitingTargetTemperature = false
          }
        })
        this.addCharacteristicDelegate({
          key: 'temperatureUnit',
          Characteristic: this.Characteristics.hap.TemperatureDisplayUnits,
          value: this.Characteristics.hap.TemperatureDisplayUnits.CELSIUS
        })
        this.addCharacteristicDelegate({
          key: 'valvePosition',
          Characteristic: this.Characteristics.eve.ValvePosition,
          unit: '%'
        })
        this.addCharacteristicDelegate({
          key: 'programCommand',
          Characteristic: this.Characteristics.eve.ProgramCommand
        // }).on('didSet', (value) => {
        //   this.values.programData = value
        })
        this.addCharacteristicDelegate({
          key: 'programData',
          Characteristic: this.Characteristics.eve.ProgramData,
          value: Buffer.from('ff04f6', 'hex').toString('base64')
        })
        this.addCharacteristicDelegate({
          key: 'lastUpdated',
          Characteristic: this.Characteristics.my.LastUpdated,
          silent: true
        })

        this.accessoryDelegate.once('heartbeat', (beat) => {
          this.beat = (beat % 60) + 5
        })
        this.accessoryDelegate.on('heartbeat', this.onHeartbeat.bind(this))
      }

      checkState (state, fromBody) {
        let updated = false
        if (state.slave_status_dhw_mode != null) {
          this.values.state = state.slave_status_dhw_mode
            ? this.Characteristics.hap.CurrentHeatingCoolingState.HEAT
            : this.Characteristics.hap.CurrentHeatingCoolingState.OFF
          this.values.valvePosition = state.slave_status_dhw_mode ? 100 : 0
          updated = true
        }
        if (state.master_status_dhw_enable != null && !this.waiting) {
          this.values.targetState = this.context.override
            ? state.master_status_dhw_enable
              ? this.Characteristics.hap.TargetHeatingCoolingState.HEAT
              : this.Characteristics.hap.TargetHeatingCoolingState.OFF
            : this.Characteristics.hap.TargetHeatingCoolingState.AUTO
        }
        if (state[this.temperatureKey] != null) {
          this.values.temperature = Math.round(state[this.temperatureKey] * 10) / 10
        }
        if (state.dhw_setpoint != null) {
          this.values.targetTemperature = Math.round(state.dhw_setpoint * 10) / 10
          updated = true
        }
        if (state.dhw_burner_starts != null && (fromBody || state.dhw_burner_starts > 0)) {
          if (this.values.burnerStarts === undefined) {
            this.addCharacteristicDelegate({
              key: 'burnerStarts',
              Characteristic: this.Characteristics.my.BurnerStarts
            })
          }
          this.values.burnerStarts = state.dhw_burner_starts
          updated = true
        }
        if (state.dhw_pump_starts != null && (fromBody || state.dhw_pump_starts > 0)) {
          if (this.values.pumpStarts === undefined) {
            this.addCharacteristicDelegate({
              key: 'pumpStarts',
              Characteristic: this.Characteristics.my.PumpStarts
            })
          }
          this.values.pumpStarts = state.dhw_pump_starts
          updated = true
        }
        if (state.dhw_burner_operation_hours != null && (fromBody || state.dhw_burner_operation_hours > 0)) {
          if (this.values.burnerHours === undefined) {
            this.addCharacteristicDelegate({
              key: 'burnerHours',
              Characteristic: this.Characteristics.my.BurnerHours
            })
          }
          this.values.burnerHours = state.dhw_burner_operation_hours
          updated = true
        }
        if (state.dhw_pump_operation_hours != null && (fromBody || state.dhw_pump_operation_hours > 0)) {
          if (this.values.pumpHours === undefined) {
            this.addCharacteristicDelegate({
              key: 'pumpHours',
              Characteristic: this.Characteristics.my.PumpHours
            })
          }
          this.values.pumpHours = state.dhw_pump_operation_hours
          updated = true
        }
        if (updated) {
          this.values.lastUpdated = String(new Date()).slice(0, 24)
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

  static get OutsideTemperature () {
    return class OutsideTemperature extends OtgwService {
      constructor (otgwAccessory, params = {}) {
        params.name = otgwAccessory.name
        params.Service = otgwAccessory.Services.hap.TemperatureSensor
        super(otgwAccessory, params)
        this.addCharacteristicDelegate({
          key: 'temperature',
          Characteristic: this.Characteristics.eve.CurrentTemperature,
          unit: '°C'
        })
        this.addCharacteristicDelegate({
          key: 'temperatureUnit',
          Characteristic: this.Characteristics.hap.TemperatureDisplayUnits,
          value: this.Characteristics.hap.TemperatureDisplayUnits.CELSIUS
        })
        this.addCharacteristicDelegate({
          key: 'lastUpdated',
          Characteristic: this.Characteristics.my.LastUpdated,
          silent: true
        })
      }

      checkState (state) {
        let updated = false
        if (state.outside_temperature != null) {
          this.values.temperature = Math.round(state.outside_temperature * 10) / 10
          updated = true
        }
        if (updated) {
          this.values.lastUpdated = String(new Date()).slice(0, 24)
        }
      }
    }
  }
}

module.exports = OtgwService
