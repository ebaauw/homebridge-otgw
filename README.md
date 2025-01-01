<p align="center">
  <img src="homebridge-otgw.png" height="200px">  
</p>
<span align="center">

# Homebridge OTGW
[![Downloads](https://img.shields.io/npm/dt/homebridge-otgw.svg)](https://www.npmjs.com/package/homebridge-otgw)
[![Version](https://img.shields.io/npm/v/homebridge-otgw.svg)](https://www.npmjs.com/package/homebridge-otgw)
[![Homebridge Discord](https://img.shields.io/discord/432663330281226270?color=728ED5&logo=discord&label=discord)](https://discord.gg/kx6G58A)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

[![GitHub issues](https://img.shields.io/github/issues/ebaauw/homebridge-otgw)](https://github.com/ebaauw/homebridge-otgw/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/ebaauw/homebridge-otgw)](https://github.com/ebaauw/homebridge-otgw/pulls)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

</span>

## Homebridge plugin for OpenTherm Gateway
Copyright © 2019-2025 Erik Baauw. All rights reserved.

This [Homebridge](https://github.com/homebridge/homebridge) plugin exposes the room thermostat and boiler, connected to an [OpenTherm Gateway](http://www.otgw.tclcode.com/index.html) (OTGW), to Apple's [HomeKit](http://www.apple.com/ios/home/).
It exposes four accessories: **Thermostat**, **Boiler**, **HotWater**, and **OutsideTemperature**, each with their own Eve history.

#### 1. Room Thermostat
The **Thermostat** accessory exposes the room thermostat, using a _Thermostat_ service, with the following characteristics:

Characteristic | OpenTherm | ID | M/S
-- | -- | -- | --
_Current Heating Cooling State_ | Central Heating Mode (in Status) | 0 | M
_Target Heating Cooling State_ | (Fixed to _Heat_) | - | -
_Current Temperature_ | Room Temperature | 24 | M
_Target Temperature_ | Room Setpoint<br>Remote Override Room Setpoint | 16<br>9 | M
_Valve Position_* | Max Relative Modulation Level | 14 | M
_Last Updated_* | - | - | -
_Schedule_* | Room Setpoint<br>Remote Override Room Setpoint | 16<br>9 | M

*You need a decent HomeKit app for these, as Home doesn't support custom characteristics.  _Schedule_ is visible only in Eve.

_Target Temperature_ can be set from HomeKit to override the thermostat's Room Setpoint.
When set, _Schedule_ switches from _On_ to _Off_.
To return control to the thermostat, set _Schedule_ back to _On_.
When the Room Setpoint is changed from the thermostat (typically because the programme resumes), _Schedule_ is set to _On_.

Effectively, _Schedule_ reflects who set the Room Setpoint: the thermostat (_On_) or HomeKit (_Off_).
The thermostat doesn't report whether it's running a programme, or a manual override.

#### 2. Boiler - Central Heating
The **Boiler** accessory exposes the boiler's Central Heating (CH) function, using a _Thermostat_ service, with the following characteristics:

Characteristic | OpenTherm | ID | M/S
-- | -- | -- | --
_Current Heating Cooling State_ | Flame Status (in Status) | 0 | S
_Target Heating Cooling State_  | Central Heating Enable (in Status) | 0 | M
_Current Temperature_ | Boiler Water Temperature | 25 | S
_Target Temperature_ |  Control Setpoint | 1 | M
_Valve Position_* | Relative Modulation Level | 17 | S
_Last Updated_* | - | - | -
_Status Fault_ | Slave Status Fault (in Status) | 0 | S
_Return Water Temperature_* | Return Water Temperature | 28 | S
_Water Pressure_* | CH Water Pressure | 18 | S
_Burner Starts_* | Burner Starts | 116 | S
_Pump Starts_* | CH Pump Starts | 117 | S
_Burner Hours_*  | Burner Operation Hours | 120 | S
_Pump Hours_* | CH Pump Operation Hours | 121 | S
_Schedule_* | (Fixed to _On_) | - | -

*You need a decent HomeKit app for these, as Home doesn't support custom characteristics.  _Schedule On/Off_ is visible only in Eve.

The _Target Heating Cooling State_ and _Target Temperature_ are controlled by the modulating Thermostat, so updates from HomeKit are ignored.

#### 3. Boiler - Domestic Hot Water
The **HotWater** accessory expose the boiler's Domestic Hot Water (DHW) function, using a _Thermostat_ service, with the following characteristics:

Characteristic | OpenTherm | ID | M/S
-- | -- | -- | --
_Current Heating Cooling State_ | DHW Mode (in Status) | 0 | S
_Target Heating Cooling State_ | DHW Enable (in Status) | 0 | M
_Current Temperature_ | DHW Temperature<br>Boiler Water Temperature | 26<br>25 | S
_Target Temperature_ | DHW Setpoint | 56 | M
_Valve Position_* | DHW Mode (in Status) | 0 | S
_Last Updated_* | - | - | -
_Burner Starts_* | DWH Burner Starts | 119 | S
_Pump Starts_* | DHW Pump/Valve Starts | 118 | S
_Burner Hours_* | DWH Burner Operation Hours | 123 | S
_Pump Hours_* | DHW Pump/Valve Operation Hours | 122 | S
_Schedule On/Off_* | (-) | 9 | M

*) You need a decent HomeKit app for these, as Home doesn't support custom characteristics.  _Schedule On/Off_ is visible only in Eve.

The _Schedule On/Off_ reflects who set the DHW mode: _On_ for thermostat controlled, _Off_ for Comfort Mode, and _Off_ for Eco mode.  My boiler allows these settings, and my thermostat can turn DHW Mode off automatically during the night and/or on holidays.

My boiler doesn't support DHW Temperature, so _Current Temperature_ is based on Boiler Water Temperature instead.

Because DHW Mode has a boolean value, _Valve Position_ is either 0 or 100.

#### 4. Outside Temperature
The **OutsideTemperature** accessory exposes the boiler's outside temperature sensor,
using a _Temperature Sensor_ service, with the following characteristics:

Characteristic | OpenTherm | ID | M/S
-- | -- | -- | --
_Current Temperature_ | Outside Temperature | 27 | S
_Last Updated_* | - | - | -

*You need a decent HomeKit app for these, as Home doesn't support custom characteristics.

The OpenThem protocol supports an outside temperature sensor, attached to the boiler.
Most boilers, including mine, have no outside temperature sensor, but the OpenTherm Gateway supports setting the outside temperature from an external source.
Homebridge OTGW includes a small `bash` script, [`weather.sh`](https://github.com/ebaauw/homebridge-otgw/blob/master/cli/weather.sh), that sets the outside temperature from OpenWeatherMap.
I run this script every 15 minutes from `cron`.

It would be nicer instead to link to a _Temperature Sensor_ exposed by another Homebridge plugin (like [homebridge-ws](https://github.com/ebaauw/homebridge-ws)), but that needs [Homebridge v0.5](https://github.com/homebridge/homebridge/issues/1039).<br>
Alternatively, expose another characteristic to set the outside temperature through a HomeKit automation.

Ideally I would like to enable/disable CH Comfort mode (or fireplace mode) from HomeKit, so the room thermostat drives the boiler based on the Outside Temperature instead of on the Room Temperature.
However, this seems to be a local setting on the room thermostat, not exposed over OpenTherm.

### Prerequisites
#### OpenTherm Gateway
You need an [OpenTherm Gateway](http://otgw.tclcode.com) with firmware [5.1](http://otgw.tclcode.com/download.html), wired to an OpenTherm [compatible](http://otgw.tclcode.com/matrix.cgi) boiler and room thermostat.

In December 2021, I had my central heating replaced by a Remeha Avanta Ace 35c boiler and a Remeha iSense wired thermostat.
Both support OpenTherm 3.0.
I specifically chose the OpenTherm gateway in combination with the iSense, which is a traditional clock thermostat, over the eTwist smart thermostat, because:
- The eTwist is cloud based and doesn't offer a local API;
- The eTwist doesn't even provide a cloud-based API, other than an allegedly buggy IFTTT integration;
- The eTwist uses a proprietary protocol to communicate with the boiler, requiring a separate gateway to connect to OpenTherm boilers.  I doubt the Remeha gateway would play nice with the OpenTherm gateway.

Before, I had a Remeha Avanta boiler and a Honeywell Chromotherm Vision Modulation room thermostat.

Please check that your setup works using the [OpenTherm Monitor](http://www.otgw.tclcode.com/otmonitor.html) (OTM), before trying Homebridge OTGW.
I'm running OTM in a Raspberry Pi, as there's no pre-compiled macOS version.

I bought my OTGW pre-soldered from [Nodo Shop](https://www.nodo-shop.nl/en/opentherm-gateway/188-opentherm-gateway.html), with an optional NodeMCU to connect the OTGW to my WiFi network.
See the [Assembly Instructions](https://www.nodo-shop.nl/nl/index.php?controller=attachment&id_attachment=47) (in Dutch, unfortunately) how to wire the OTGW to the thermostat and boiler and how to configure the NodeMCU as serial server.

#### Homebridge
You need a server to run Homebridge.
This can be anything running [Node.js](https://nodejs.org): from a Raspberry Pi, a NAS system, or an always-on PC running Linux, macOS, or Windows.
See the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for details.
I run Homebridge OTGW on a Raspberry Pi 4B.

To interact with HomeKit, you need Siri or a HomeKit app on an iPhone, Apple Watch, iPad, iPod Touch, or Apple TV (4th generation or later).
I recommend to use the latest released versions of iOS, watchOS, and tvOS.  
Please note that Siri and even Apple's [Home](https://support.apple.com/en-us/HT204893) app still provide only limited HomeKit support.
To use the full features of Homebridge OTGW, you might want to check out some other HomeKit apps, like the [Eve](https://www.evehome.com/en/eve-app) app (free) or Matthias Hochgatterer's [Home+](https://hochgatterer.me/home/) app (paid).

As HomeKit uses Bonjour to discover Homebridge, the server running Homebridge must be on the same subnet as your iDevices running HomeKit.
For remote access and for HomeKit automations, you need to setup an Apple TV (4th generation or later), HomePod, or iPad as [home hub](https://support.apple.com/en-us/HT207057).

### Connection
The Homebridge OTGW plugin connects to the web server provided by OTM.
For now, the web server needs to be unsecured, i.e. use plain HTTP and no username/password.  The advantage of using the OTM web server is that Homebridge OTGW doesn't need to deal with the serial connection to the OTGW.
Also, OTM supports multiple simultaneous clients.
The disadvantage, obviously, is the use of an additional component.

As a fallback, the Homebridge OTGW plugin can connect to the OTGW when equipped with an optional NodeMCU serial server.
Note that this server only entertains a single concurrent connection - when you start OTM, the connection from Homebridge OTGW is closed.

When the fallback is configured, Homebridge OTGW tries to (re-)connect to OTM first, falling back to OTGW's NodeMCU when that fails.
This way, Homebridge OTGW continuously interacts with the OTGW, irrespective of whether OTM is running or not.

### Installation
To install Homebridge OTGW:
- Follow the instructions on the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) to install Node.js and Homebridge;
- Install the Homebridge OTGW plugin through Homebridge Config UI X or manually by:
  ```
  $ sudo npm -g i homebridge-otgw
  ```
- Edit `config.json` and add the `OTGW` platform provided by Homebridge OTGW, see [**Configuration**](#configuration).

### Configuration
In Homebridge's `config.json` you need to specify Homebridge OTGW as a platform plugin.  Furthermore, you can specify the hostname and port of the OTM web server.
When not specified, the default `localhost:8080` is used.
Optionally, you can specify the hostname and port of the NodeMCU serial server in the OTGW:
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

### Caveats
Homebridge OTGW is a hobby project of mine, provided as-is, with no warranty whatsoever.  I've been running it successfully at my home for years, but your mileage might vary.

The HomeKit terminology needs some getting used to.
An _accessory_ more or less corresponds to a physical device, accessible from your iOS device over WiFi or Bluetooth.
A _bridge_ (like Homebridge) is an accessory that provides access to other, bridged, accessories.
An accessory might provide multiple _services_.
Each service corresponds to a virtual device (like a lightbulb, switch, motion sensor, ..., but also: a programmable switch button, accessory information, battery status).
Siri interacts with services, not with accessories.
A service contains one or more _characteristics_.
A characteristic is like a service attribute, which might be read or written by HomeKit apps.
You might want to checkout Apple's [HomeKit Accessory Simulator](https://developer.apple.com/documentation/homekit/testing_your_app_with_the_homekit_accessory_simulator), which is distributed as an additional tool for `Xcode`.
