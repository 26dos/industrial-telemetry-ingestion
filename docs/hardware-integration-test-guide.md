# Hardware Integration Test Guide

This guide documents the field-test path for running the telemetry collector on an RK2612A edge gateway with a PC-hosted Modbus RTU simulator.

## Test Topology

```mermaid
flowchart LR
    PC["Ubuntu PC
Modbus RTU slave simulator"] -->|"USB-RS485 + twisted pair"| RK["RK2612A edge gateway
Modbus master"]
    RK -->|"MQTT telemetry topics"| Broker["Mosquitto broker"]
    Broker --> Web["Vue operations console"]
    Web -->|"HTTP control request"| API["Node.js backend"]
    API -->|"MQTT control topic"| RK
```

## Required Hardware

| Item | Purpose |
| --- | --- |
| RK2612A gateway | Runs the backend service, MQTT broker, and Modbus polling service. |
| 12V DC power supply | Powers the gateway. Confirm polarity before startup. |
| Ethernet cable | Connects the gateway to the LAN. |
| USB-to-RS485 adapter | Connects the PC simulator to the gateway RS485 port. |
| Shielded twisted pair | Carries RS485 A/B signals. |
| Ubuntu PC | Hosts the Modbus simulator and validation tools. |

## RS485 Wiring

Connect A/Data+ to A, B/Data- to B, and optionally connect GND as a shared reference for longer cable runs. If there is only one device on the bus, enable the RK2612A 120 ohm termination switch for that channel.

After SSHing into the gateway, confirm the active serial device:

```bash
ls -la /dev/ttyS* /dev/ttymxc* /dev/ttyAMA* 2>/dev/null
dmesg | grep -i tty
```

Record the actual device path, for example `/dev/ttyS3`, and use it in `server/data/serials.json`.

## Start the PC Modbus Simulator

Install dependencies:

```bash
python3 -m pip install pymodbus pyserial
```

Run a Ginlong-style inverter simulator on `/dev/ttyUSB0`:

```bash
python3 tools/modbus_simulator.py --port /dev/ttyUSB0 --slave 1 --baud 9600 --inverter ginlong
```

Useful options:

```bash
python3 tools/modbus_simulator.py --inverter huawei
python3 tools/modbus_simulator.py --no-dynamic
python3 tools/modbus_simulator.py --update-interval 3
```

## Deploy on the Gateway

Install Node.js 18, build tools, and Mosquitto. Enable MQTT over WebSocket so the browser UI can subscribe directly:

```conf
listener 1883
protocol mqtt
allow_anonymous true

listener 8083
protocol websockets
allow_anonymous true
```

Then install and start the service:

```bash
cd /opt/industrial-telemetry-ingestion/server
npm install
node app.js
```

Open the console at `http://<gateway-ip>:3000`.

## Validation Checklist

1. The backend starts without serial-port errors.
2. Mosquitto listens on ports `1883` and `8083`.
3. The Modbus simulator reports read requests from the gateway.
4. The Realtime Data view shows measurement and status updates.
5. A setpoint command from the UI is published to MQTT and written back through Modbus.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| No serial data | A/B wires swapped or wrong device path | Swap A/B and re-check `/dev/tty*`. |
| Permission denied | User cannot access serial device | Add the service user to `dialout` or run with proper permissions. |
| UI shows MQTT disconnected | WebSocket listener is disabled | Confirm Mosquitto port `8083` and browser network access. |
| Reads timeout | Baud rate/slave ID mismatch | Align simulator options with `serials.json` and inverter config. |
| Setpoint does not apply | MQTT control topic mismatch | Check backend logs and `modbusService` subscriptions. |
