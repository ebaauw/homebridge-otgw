# homebridge-otgw
[![npm](https://img.shields.io/npm/dt/homebridge-otgw.svg)](https://www.npmjs.com/package/homebridge-otgw) [![npm](https://img.shields.io/npm/v/homebridge-otgw.svg)](https://www.npmjs.com/package/homebridge-otgw)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

## Homebridge plugin for OpenTherm Gateway
Copyright © 2019 Erik Baauw. All rights reserved.

This [homebridge](https://github.com/nfarina/homebridge) plugin exposes (or rather: will expose) an [OpenTherm Gateway](http://www.otgw.tclcode.com/index.html) (OTGW) to Apple's [HomeKit](http://www.apple.com/ios/home/).

### Work in Progress
Currently, homebridge-otgw exposes three _Thermostat_ accessories: **Thermostat**, **Boiler**, and **HotWater**, as described below, each with its own Eve history.

#### 1. Room Thermostat
An accessory with a _Thermostat_ service to expose the room thermostat:

Characteristic | OpenTherm | ID
-- | -- | --
_Current Heating Cooling State_ | Central Heating Mode (in Status) | 0
_Target Heating Cooling State_ | Remote Override Room Setpoint| 9
_Current Temperature_ | Room Temperature | 24
_Target Temperature_ | Room Setpoint<br>Remote Override Room Setpoint | 16<br>9
_Valve Position_ | Max Relative Modulation Level<br> | 14

The _Target Heating Cooling State_ reflects who set the Room Setpoint: the thermostat schedule (_Auto_) or the user (_Heat_).

#### 2. Boiler - Central Heating
An accessory with a _Thermostat_ service to expose the boiler's Central Heating (CH) function:

Characteristic | OpenTherm | ID
-- | -- | --
_Current Heating Cooling State_ | Flame Status (in Status) | 0
_Target Heating Cooling State_ (read only) | Central Heating Enable (in Status) | 0
_Current Temperature_ | Boiler Water Temperature | 25
_Target Temperature_ (read-only)| Control Setpoint | 1
_Valve Position_ | Relative Modulation Level | 17

The _Target Temperature_ and _Target Heating Cooling State_ are controlled by the modulating Thermostat, so updates by the user are ignored.

Todo: Expose Return Water Temperature (28) as additional _Temperature Sensor_ service (without history) in this accessory, or as a separate accessory (with history).

#### 3. Boiler - Domestic Hot Water
An accessory with a _Thermostat_ service to expose the boiler's Domestic Hot Water (DHW) function:

Characteristic | OpenTherm | ID
-- | -- | --
_Current Heating Cooling State_ | DHW Mode (in Status) | 0
_Target Heating Cooling State_ | DHW Enable (in Status) | 0
_Current Temperature_ | DHW Temperature<br>Boiler Water Temperature | 26<br>25
_Target Temperature_ | DHW Setpoint | 56
_Valve Position_ | DHW Mode (in Status) | 0

My boiler doesn't support DHW Temperature, so use Boiler Water Temperature instead.

The _Target Heating Cooling State_ should reflects sets the DHW mode: _Auto_ for thermostat controlled, _Heat_ for Confort Mode, and _Off_ for Eco mode.  My boiler allows these settings, and my thermostat can turn DHW Mode off automatically during the night and/or on holidays.

#### 4. Outside Temperature
TODO - Currently not exposed: an accessory with a _Temperature Sensor_ service to expose the outside temperature.

Characteristic | OpenTherm | ID
-- | -- | --
_Current Temperature_ | Outside Temperature | 27

My boiler has no outside temperature sensor, but I'm feeding the outside temperature from OpenWeatherMap to the OTGW gateway.  Currently I'm doing this by running a small `bash` script, [`weather.sh`](https://github.com/ebaauw/homebridge-otgw/blob/master/cli/weather.sh), every 15 minutes from `cron`. It would be nicer instead to link to a _Temperature Sensor_ exposed by another homebridge plugin (like [homebridge-ws](https://github.com/ebaauw/homebridge-ws)), but that needs [homebridge v0.5](https://github.com/nfarina/homebridge/issues/1039).

Ideally I would like to enable CH Comfort mode (or fireplace mode) from here (control the boiler based on the Outside Temperature instead of on the Room Temperature), but this seems to be a local setting on the thermostat, not exposed over OpenTherm.

### Prerequisites
You need an [OpenTherm Gateway](http://otgw.tclcode.com) with firmware [4.2.5](http://otgw.tclcode.com/download.html), wired to an OpenTherm [compatible](http://otgw.tclcode.com/matrix.cgi) boiler and room thermostat.  I have a Remeha Avanta and a Honeywell Chromotherm Vision Modulation.  Please check that your setup works using [OpenTherm Monitor](http://www.otgw.tclcode.com/otmonitor.html) (OTM), before trying homebridge-otgw.  I'm running OTM in a Raspberry Pi, as there's no pre-compiled macOS version.

I bought my OTGW pre-soldered from [Nodo Shop](https://www.nodo-shop.nl/en/opentherm-gateway/188-opentherm-gateway.html), with an optional NodeMCU to connect the OTGW to my WiFi network.  See the [Assembly Instructions](https://www.nodo-shop.nl/nl/index.php?controller=attachment&id_attachment=47) (in Dutch, unfortunately) how to wire the OTGW to the thermostat and boiler and how to configure the NodeMCU as serial server.  

### Connection
The homebridge-otgw plugin connects to the web server provided by OTM.  For now, the web server needs to be unsecured, i.e. use plain HTTP and no username/password.  The advantage of using the OTM web server is that homebridge-otgw doesn't need to deal with the serial connection to the OTGW.  Also, OTM supports multiple simultaneous clients. The disadvantage, obviously, is the use of an additional component.

As a fallback, the homebridge-otgw plugin can connect to the OTGW when equipped with an optional NodeMCU serial server.  Note that this server only entertains a single concurrent connection - when you start OTM, the connection from homebridge-otgw is closed

When the fallback is configured, homebridge-otgw tries to (re-)connect to OTM first, falling back to OTGW's NodeMCU when that fails.  This way, homebridge-otgw continously interacts with the OTGW, irrespective of whether OTM is running or not.

### Installation
As `homebridge-otgw` is built using `homebridge-lib`, the latter must be installed as a peer dependency:
```
$ sudo npm -g i homebridge-lib homebridge-otgw
```

### Configuration
In homebridge's `config.json` you need to specify homebridge-otgw as a platform plugin.  Furthermore, you can specify the hostname and port of the OTM web server.  When not specified, the default `localhost:8080` is used.  Optionally, you can specify the hostname and port of the NodeMCU serial server:
```json
  "platforms": [
    {
      "platform": "OTGW",
      "name": "OTGW",
      "host": "192.168.x.x:8080",
      "otgw": "192.168.x.y:6638"
    }
  ]
```
