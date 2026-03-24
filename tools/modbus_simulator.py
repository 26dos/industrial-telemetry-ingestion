#!/usr/bin/env python3
"""
Modbus RTU Slave 模拟器
模拟逆变器响应 Modbus RTU 读写请求，用于与 RK2612A 采集程序联调测试。

依赖安装:
    pip3 install pymodbus pyserial

用法:
    python3 modbus_simulator.py --port /dev/ttyUSB0 --address 1 --baud 9600
    python3 modbus_simulator.py --port /dev/ttyUSB0 --address 1 --baud 9600 --model huawei

支持的逆变器模型:
    ginlong  - 锦浪 3P 系列 (寄存器 3001-3100)
    huawei   - 华为 SUN2000 系列 (寄存器 30073-40123)
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
from pymodbus.server import StartSerialServer
from pymodbus.transaction import ModbusRtuFramer

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ModbusSimulator")


# ─── 寄存器预设数据 ─────────────────────────────────────────

GINLONG_REGISTERS = {
    # YC 遥测
    3001: 2200,   # A相电压 220.0V  (factor 0.1)
    3002: 2190,   # B相电压 219.0V
    3003: 2210,   # C相电压 221.0V
    3004: 150,    # A相电流 15.0A
    3007: 0,      # 有功高位 (U32)
    3008: 5000,   # 有功低位  => 500.0kW (factor 0.1)
    3009: 0,      # 无功高位 (I32)
    3010: 1000,   # 无功低位  => 100.0kVar
    # YX 遥信
    3100: 1,      # 发电状态: bit0=1 表示发电中
    # YT 遥调
    4001: 0,      # 有功调节
}

HUAWEI_REGISTERS = {
    # YC 遥测
    30073: 0,     # 额定功率高位 (U32)
    30074: 100000, # 额定功率低位 => 100kW (factor 0.001)
    32069: 2200,  # A相电压 220.0V  (factor 0.1)
    32070: 2190,  # B相电压 219.0V
    32071: 2210,  # C相电压 221.0V
    32072: 0,     # A相电流高位 (I32)
    32073: 15000, # A相电流低位 => 15.0A (factor 0.001)
    32074: 0,     # B相电流高位
    32075: 14500, # B相电流低位 => 14.5A
    32076: 0,     # C相电流高位
    32077: 15200, # C相电流低位 => 15.2A
    32080: 0,     # 有功高位 (I32)
    32081: 45000, # 有功低位 => 45.0kW (factor 0.001)
    32082: 0,     # 无功高位 (I32)
    32083: 5000,  # 无功低位 => 5.0kVar
    32084: 980,   # 功率因数 0.980 (I16, factor 0.001)
    32085: 5000,  # 频率 50.00Hz (U16, factor 0.01)
    32089: 2,     # 运行状态: 2=发电
    32106: 0,     # 总发电量高位 (U32)
    32107: 500000, # 总发电量低位 => 5000kWh (factor 0.01)
    32141: 0,     # 日发电量高位 (U32)
    32142: 12000, # 日发电量低位 => 120kWh (factor 0.01)
    32300: 1,     # AGC投入
    # YT 遥调
    40120: 0,     # 有功调节
    40123: 0,     # 无功调节
}


def build_datastore(model, slave_addr):
    """根据模型构建寄存器数据"""
    regs = GINLONG_REGISTERS if model == "ginlong" else HUAWEI_REGISTERS

    block = ModbusSequentialDataBlock(0, [0] * 65536)
    for addr, val in regs.items():
        block.setValues(addr + 1, [val])  # pymodbus 内部地址偏移 +1

    store = ModbusSlaveContext(
        di=ModbusSequentialDataBlock(0, [0] * 10),
        co=ModbusSequentialDataBlock(0, [0] * 10),
        hr=block,
        ir=ModbusSequentialDataBlock(0, [0] * 10),
    )

    context = ModbusServerContext(slaves={slave_addr: store}, single=False)
    return context, store


def dynamic_update(store, model, interval):
    """定时随机更新寄存器值，模拟真实数据变化"""
    log.info(f"动态数据更新已启动 (间隔 {interval}s)")

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

            log.info("[动态更新] 寄存器值已刷新")
        except Exception as e:
            log.error(f"[动态更新] 异常: {e}")


def main():
    parser = argparse.ArgumentParser(description="Modbus RTU Slave 模拟器")
    parser.add_argument(
        "--port", required=True, help="串口设备路径，如 /dev/ttyUSB0"
    )
    parser.add_argument(
        "--address", type=int, default=1, help="Modbus 从站地址 (默认: 1)"
    )
    parser.add_argument(
        "--baud", type=int, default=9600, help="波特率 (默认: 9600)"
    )
    parser.add_argument(
        "--model",
        choices=["ginlong", "huawei"],
        default="ginlong",
        help="逆变器模型 (默认: ginlong)",
    )
    parser.add_argument(
        "--dynamic",
        type=int,
        default=5,
        help="动态更新间隔秒数，0=禁用 (默认: 5)",
    )

    args = parser.parse_args()

    log.info("=" * 60)
    log.info("Modbus RTU Slave 模拟器")
    log.info(f"  串口:     {args.port}")
    log.info(f"  从站地址: {args.address}")
    log.info(f"  波特率:   {args.baud}")
    log.info(f"  逆变器:   {args.model}")
    log.info(f"  动态更新: {'每{}秒'.format(args.dynamic) if args.dynamic else '禁用'}")
    log.info("=" * 60)

    context, store = build_datastore(args.model, args.address)

    if args.dynamic > 0:
        t = threading.Thread(
            target=dynamic_update,
            args=(store, args.model, args.dynamic),
            daemon=True,
        )
        t.start()

    log.info(f"模拟器启动中... (Ctrl+C 停止)")

    try:
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
    except KeyboardInterrupt:
        log.info("模拟器已停止")
    except Exception as e:
        log.error(f"启动失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
