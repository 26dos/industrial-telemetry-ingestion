#!/usr/bin/env python3
"""
Modbus RTU slave simulator
Simulates inverter responses to Modbus RTU reads/writes for RK2612A integration testing.

Compatible with pymodbus 2.x and 3.x

Install dependencies:
    pip3 install pymodbus pyserial

Usage:
    python3 modbus_simulator.py --port /dev/ttyUSB0 --address 1 --baud 9600
    python3 modbus_simulator.py --port /tmp/vRS485_slave --address 1 --baud 9600 --model huawei
"""

import argparse
import logging
import sys
import time
import threading
import random

from pymodbus.datastore import (
    ModbusSequentialDataBlock,
    ModbusSlaveContext,
    ModbusServerContext,
)

try:
    from pymodbus.server import StartSerialServer
except ImportError:
    from pymodbus.server.sync import StartSerialServer

try:
    from pymodbus.transaction import ModbusRtuFramer
except ImportError:
    ModbusRtuFramer = None

import pymodbus
PYMODBUS_V3 = int(pymodbus.__version__.split('.')[0]) >= 3

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ModbusSimulator")

GINLONG_REGISTERS = {
    3001: 2200,   # Phase A voltage 220.0V  (factor 0.1)
    3002: 2190,   # Phase B voltage 219.0V
    3003: 2210,   # Phase C voltage 221.0V
    3004: 150,    # Phase A current 15.0A
    3007: 0,      # Active powerhigh word (U32)
    3008: 5000,   # Active powerlow word  => 500.0kW (factor 0.1)
    3009: 0,      # Reactive powerhigh word (I32)
    3010: 1000,   # Reactive powerlow word  => 100.0kVar
    3100: 1,      # GeneratingStatus: bit0=1 means generating
    4001: 0,      # Active power adjustment
}

HUAWEI_REGISTERS = {
    30073: 0,
    30074: 100000,
    32069: 2200,
    32070: 2190,
    32071: 2210,
    32072: 0,
    32073: 15000,
    32074: 0,
    32075: 14500,
    32076: 0,
    32077: 15200,
    32080: 0,
    32081: 45000,
    32082: 0,
    32083: 5000,
    32084: 980,
    32085: 5000,
    32089: 2,
    32106: 0,
    32107: 500000,
    32141: 0,
    32142: 12000,
    32300: 1,
    40120: 0,
    40123: 0,
}


def build_datastore(model, slave_addr):
    regs = GINLONG_REGISTERS if model == "ginlong" else HUAWEI_REGISTERS

    block = ModbusSequentialDataBlock(0, [0] * 65536)
    for addr, val in regs.items():
        block.setValues(addr + 1, [val])

    store = ModbusSlaveContext(
        di=ModbusSequentialDataBlock(0, [0] * 10),
        co=ModbusSequentialDataBlock(0, [0] * 10),
        hr=block,
        ir=ModbusSequentialDataBlock(0, [0] * 10),
    )

    context = ModbusServerContext(slaves={slave_addr: store}, single=False)
    return context, store


def dynamic_update(store, model, interval):
    log.info(f"dynamic data updates started (interval {interval}s)")

    while True:
        time.sleep(interval)
        try:
            if model == "ginlong":
                base_v = 2200
                store.setValues(3, 3001 + 1, [base_v + random.randint(-30, 30)])
                store.setValues(3, 3002 + 1, [base_v + random.randint(-30, 30)])
                store.setValues(3, 3003 + 1, [base_v + random.randint(-30, 30)])
                store.setValues(3, 3004 + 1, [random.randint(100, 200)])
                power = random.randint(3000, 8000)
                store.setValues(3, 3008 + 1, [power])
            else:
                base_v = 2200
                store.setValues(3, 32069 + 1, [base_v + random.randint(-30, 30)])
                store.setValues(3, 32070 + 1, [base_v + random.randint(-30, 30)])
                store.setValues(3, 32071 + 1, [base_v + random.randint(-30, 30)])
                current = random.randint(12000, 18000)
                store.setValues(3, 32073 + 1, [current])
                power = random.randint(30000, 60000)
                store.setValues(3, 32081 + 1, [power])

            log.info("[Dynamic update] register values refreshed")
        except Exception as e:
            log.error(f"[Dynamic update] error: {e}")


def main():
    parser = argparse.ArgumentParser(description="Modbus RTU slave simulator")
    parser.add_argument("--port", required=True, help="Serial portDevice Path")
    parser.add_argument("--address", type=int, default=1, help="Modbus Slave address (default: 1)")
    parser.add_argument("--baud", type=int, default=9600, help="Baud rate (default: 9600)")
    parser.add_argument("--model", choices=["ginlong", "huawei"], default="ginlong", help="Invertermodel")
    parser.add_argument("--dynamic", type=int, default=5, help="dynamic update interval in seconds; 0 disables updates")

    args = parser.parse_args()

    log.info("=" * 60)
    log.info("Modbus RTU slave simulator")
    log.info(f"  Serial port:     {args.port}")
    log.info(f"  Slave address: {args.address}")
    log.info(f"  Baud rate:   {args.baud}")
    log.info(f"  Inverter:   {args.model}")
    log.info(f"  pymodbus: {pymodbus.__version__}")
    log.info("=" * 60)

    context, store = build_datastore(args.model, args.address)

    if args.dynamic > 0:
        t = threading.Thread(
            target=dynamic_update,
            args=(store, args.model, args.dynamic),
            daemon=True,
        )
        t.start()

    log.info("Simulator started... (Ctrl+C stop)")

    try:
        if PYMODBUS_V3:
            StartSerialServer(
                context=context,
                framer=ModbusRtuFramer,
                port=args.port,
                baudrate=args.baud,
                stopbits=1,
                bytesize=8,
                parity="N",
                timeout=1,
            )
        else:
            StartSerialServer(
                context,
                framer=ModbusRtuFramer,
                port=args.port,
                baudrate=args.baud,
                stopbits=1,
                bytesize=8,
                parity="N",
                timeout=1,
            )
    except KeyboardInterrupt:
        log.info("simulator stopped")
    except Exception as e:
        log.error(f"startup failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
