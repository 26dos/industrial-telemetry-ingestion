# Industrial Telemetry Ingestion Demo

This walkthrough presents the repo as a real-time data ingestion and operator
console for edge collection units.

![Industrial telemetry ingestion demo](assets/screenshots/telemetry-demo.png)

## Sequence Diagram

```mermaid
sequenceDiagram
    participant Device as Edge Device
    participant Broker as MQTT Broker
    participant Server as Express API
    participant Store as Local Config Store
    participant UI as Vue Console

    Device->>Broker: publish device/{id}/yc/change
    UI->>Server: POST /api/getAllData/YC
    Server->>Store: load point table mapping
    Server->>Broker: subscribe to telemetry topic
    Broker-->>Server: telemetry payload
    Server-->>UI: normalized telemetry rows
    UI-->>UI: render current values and quality flags
```

## Entity Graph

```mermaid
erDiagram
    COLLECTOR ||--o{ SERIAL_PORT : manages
    COLLECTOR ||--o{ INVERTER : monitors
    INVERTER ||--|| POINT_TABLE : uses
    POINT_TABLE ||--o{ POINT : maps
    COLLECTOR ||--o{ MQTT_TOPIC : publishes
    MQTT_TOPIC ||--o{ TELEMETRY_EVENT : carries

    COLLECTOR {
      string device_id
      string network_config
      string service_config
    }
    INVERTER {
      string inverter_id
      string protocol
      int modbus_address
    }
    POINT {
      int point_number
      string name
      string unit
      int quality
    }
```

## Flow Chart

```mermaid
flowchart LR
    A[Serial, LoRa, Modbus, IEC 104 devices] --> B[MQTT broker]
    B --> C[Express ingestion service]
    C --> D[Protocol normalizer]
    D --> E[Point-table mapper]
    E --> F[JSON API responses]
    F --> G[Vue operator console]
```

## Sample Telemetry Payload

```json
{
  "device_id": "data_collector_001",
  "topic": "device/001/yc/change",
  "timestamp": "2026-01-15T14:30:25.123Z",
  "inverters": [
    {
      "inverter_id": "inv_001",
      "yc_data": [
        {
          "ycnum": 1,
          "name": "voltage",
          "value": 300.0,
          "unit": "V",
          "quality": 1
        }
      ]
    }
  ]
}
```
