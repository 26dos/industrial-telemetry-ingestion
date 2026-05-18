# industrial-telemetry-ingestion

Industrial telemetry ingestion and monitoring console for edge data collectors.

This repo is a full-stack prototype for configuring an industrial collection
unit, receiving real-time device telemetry, and managing protocol-specific
point tables. It is intentionally not crypto-related: the system works with
hardware-facing data streams such as MQTT, Modbus, serial devices, LoRa, and
IEC 60870-5-104 style telemetry.

## What It Demonstrates

- **Real-time ingestion** from hardware devices over MQTT.
- **Industrial protocol support** for Modbus and IEC 104-style telemetry.
- **Edge device configuration** for network settings, serial ports, LoRa, and
  inverter metadata.
- **Point-table management** for inverter tables and 104 forwarding tables.
- **Operational UI** built with Vue 3, Vite, Element Plus, Pinia, and Axios.
- **Backend API service** built with Node.js, Express, mqtt.js, serialport, and
  local JSON-backed configuration files.

## Architecture

```
Vue 3 operator console
   |                         |
   | HTTP JSON APIs          | MQTT over WebSocket
   v                         v
Express configuration API    MQTT broker
   |                         ^
   |                         |
local config + point tables  edge collector / devices
                             - inverters
                             - serial devices
                             - LoRa modules
                             - Modbus / IEC 104 data
```

## Repository Layout

```
industrial-telemetry-ingestion/
  server/
    app.js                   Express service entrypoint
    routes/                  configuration and monitoring APIs
    services/                MQTT, Modbus, and IEC 104 services
    data/                    local JSON config and point-table fixtures

  web/
    src/
      views/                 operator screens
      api/                   HTTP client wrapper
      utils/mqtt.js          browser MQTT client
      stores/                Pinia state
      layout/                main console layout

  tools/
    modbus_simulator.py      local protocol testing helper

  docs/
    hardware integration, deployment, and communication notes
```

## Feature Areas

| Area | Purpose | Interface |
| --- | --- | --- |
| Login | Local operator access for the console | Browser |
| System config | Collection, service, control, event, and log settings | HTTP |
| Network config | IP, subnet, gateway, and network restart controls | HTTP |
| LoRa config | Wireless module parameters | HTTP |
| Serial management | Serial port CRUD and protocol settings | HTTP |
| Inverter management | Device metadata, Modbus address, protocol, and model config | HTTP |
| Real-time telemetry | Telemetry polling, control commands, and change events | HTTP + MQTT |
| Point tables | Upload, inspect, select, and delete device point tables | HTTP |
| System info | Version, CPU/memory status, service restart | HTTP |

## API Shape

The backend exposes a set of JSON `POST` endpoints for configuration and
operations. Examples:

```text
POST /api/getConfigInfo
POST /api/setConfigInfo
POST /api/getNetwork
POST /api/setNetwork
POST /api/getSerialInfo
POST /api/setSerialInfo
POST /api/getInverterInfo
POST /api/setInverterInfo
POST /api/getAllData/YC
POST /api/getAllData/YX
POST /api/control/YT
POST /api/uploadInverterTableFile
POST /api/upload104File
POST /api/getSystemInfo
```

MQTT topics carry real-time device updates:

```text
device/{id}/ycchange
device/{id}/yxchange
```

Example payload:

```json
{
  "device_id": "data_collector_001",
  "timestamp": "2026-01-15 14:30:25.123",
  "inverters": [
    {
      "inverter_id": "inv_001",
      "yc_data": [
        {
          "ycnum": 1,
          "value": 300.0,
          "name": "voltage",
          "unit": "V",
          "quality": 1
        }
      ]
    }
  ]
}
```

## Quick Start

Backend:

```bash
cd server
npm install
npm run dev
```

Frontend:

```bash
cd web
npm install
npm run dev
```

Useful environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Express API port |
| `MQTT_BROKER` | `mqtt://localhost:1883` | MQTT broker address |
| `MQTT_DEVICE_ID` | `001` | Collector device id |

## Why This Repo Belongs In The Portfolio

This is a practical ingestion system rather than a polished demo. It shows the
same engineering muscles needed in data pipeline work:

- protocol integration
- real-time event handling
- schema-like point-table mapping
- operator-facing monitoring
- configuration management for edge devices
- local simulators and integration docs
