#!/bin/bash

# weather.sh
# Copyright © 2017-2020 Erik Baauw. All rights reserved.
#
# Set the OTGW outside temperature from OpenWeatherMap.

PATH=$PATH:~/Applications

# OpenWeatherMap config
key=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
q="Amsterdam"

# OpenTherm Gateway config.
OT_HOST=localhost:8080

# Redirect stdout and stderr to logfile.
exec >> "${HOME}/Library/Logs/$(basename "${0}" .command).log" 2>&1

# Get temperature, humidity, and pressure from OpenWeatherMap.
cmd="curl -s -H \"Content-Type: application/json\""
cmd="${cmd} \"https://api.openweathermap.org/data/2.5/weather?APPID=${key}&units=metric&q=${q}\""
response=$(eval ${cmd})

temp=$(json -c "${response}" -avp /main/temp)
echo "$(date): temperature: ${temp}°C"

# Update OTGW outside temperature
if [ ! -z "${temp}" -a ! -z "${OT_HOST}" ] ; then
  cmd="curl -sGet \"http://${OT_HOST}/command?OT=${temp}\""
  response=$(eval ${cmd})
  for i in 1 2 3 4 5 ; do
    case "${response}" in
      OT:*)
        break
        ;;
      *)
        sleep 1
        response=$(eval ${cmd})
        ;;
    esac
  done
  echo "$(date): otgw response: ${response}"
fi
