# Communication Architecture: HTTP, WebSocket, and MQTT

This project combines three communication paths: HTTP for configuration, MQTT for telemetry/control events, and WebSocket transport so the browser can subscribe to broker topics.

## Component Graph

```mermaid
flowchart LR
    UI["Vue operations console"] -->|"HTTP REST"| API["Node.js backend"]
    UI -->|"MQTT over WebSocket"| Broker["Mosquitto broker"]
    API -->|"Publish control commands"| Broker
    Collector["Modbus polling service"] -->|"Publish telemetry changes"| Broker
    Broker --> UI
    API --> Files["JSON config and point tables"]
```

## Protocol Responsibilities

| Protocol | Used For | Why |
| --- | --- | --- |
| HTTP REST | Configuration, point-table management, system commands | Request/response semantics and simple admin workflows. |
| MQTT | Telemetry updates, status changes, setpoint commands | Lightweight event stream between field services and UI. |
| WebSocket | Browser MQTT transport | Browsers cannot open raw MQTT TCP sockets. |
| IEC 60870-5-104 | SCADA forwarding interface | Exposes mapped measurements, statuses, and controls to upstream systems. |

## Data Flow

```mermaid
sequenceDiagram
    participant Device as Inverter / Simulator
    participant Modbus as Modbus Poller
    participant Broker as MQTT Broker
    participant UI as Browser UI
    participant API as Backend API

    Modbus->>Device: Read configured registers
    Device-->>Modbus: Register values
    Modbus->>Broker: Publish changed measurements/statuses
    Broker-->>UI: Push realtime updates over WebSocket
    UI->>API: Submit setpoint command
    API->>Broker: Publish control command
    Broker-->>Modbus: Deliver control command
    Modbus->>Device: Write register
```

## Topic Shape

Use separate topic families for measurements, statuses, and controls. The exact topic names are defined in `server/services/mqttService.js` and `web/src/utils/mqtt.js`.

Recommended convention:

```text
telemetry/yc/change      # measurement changes
telemetry/yx/change      # status changes
control/yt/command       # setpoint commands
system/health            # service health and diagnostics
```

## Operational Notes

- The UI uses HTTP for durable state and MQTT for live state.
- The backend owns validation before publishing control commands.
- The Modbus service translates point-table indexes into device register reads/writes.
- IEC 104 exposes the same realtime store through a SCADA-compatible protocol surface.
