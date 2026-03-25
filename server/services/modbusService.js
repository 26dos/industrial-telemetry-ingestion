/**
 * Modbus RTU 采集服务
 *
 * 通过 RS485 串口轮询逆变器 Modbus 寄存器，解析遥测/遥信数据，
 * 经 MQTT 发布变化数据；订阅遥调主题，接收指令后写 Modbus 寄存器。
 */
const ModbusRTU = require('modbus-serial');
const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');
const { getRealtimeStore } = require('./mqttService');

const DATA_DIR = path.join(__dirname, '../data');
const BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const DEVICE_ID = process.env.MQTT_DEVICE_ID || '001';
const PARITY_MAP = ['none', 'odd', 'even'];

let mqttClient = null;
const serialClients = {};
const lastYcValues = {};
const lastYxValues = {};
let pollTimer = null;
let polling = false;

// --------------- 工具函数 ---------------

function readJSON(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf-8'));
}

/**
 * 将逆变器点表索引映射为全局索引（避免多台逆变器冲突）
 * 规则：inverter.index * 100 + point.index
 */
function globalIndex(inverterIdx, pointIdx) {
  return inverterIdx * 100 + pointIdx;
}

// --------------- 寄存器值解析 ---------------

function parseRegValue(regMap, point) {
  const addr = point.register;
  if (regMap[addr] === undefined) return null;

  const factor = parseFloat(point.factor) || 1;

  switch (point.data_type) {
    case 'U16':
      return regMap[addr] * factor;

    case 'I16': {
      let v = regMap[addr];
      if (v > 0x7fff) v -= 0x10000;
      return v * factor;
    }

    case 'U32': {
      if (regMap[addr + 1] === undefined) return null;
      let raw;
      if (point.byte_order === 'CDAB') {
        raw = (regMap[addr + 1] << 16) + regMap[addr];
      } else {
        raw = (regMap[addr] << 16) + regMap[addr + 1];
      }
      return (raw >>> 0) * factor;
    }

    case 'I32': {
      if (regMap[addr + 1] === undefined) return null;
      let raw;
      if (point.byte_order === 'CDAB') {
        raw = (regMap[addr + 1] << 16) + regMap[addr];
      } else {
        raw = (regMap[addr] << 16) + regMap[addr + 1];
      }
      if (raw > 0x7fffffff) raw -= 0x100000000;
      return raw * factor;
    }

    default:
      return regMap[addr] * factor;
  }
}

function parseYxStatus(regMap, point) {
  const addr = point.register;
  if (regMap[addr] === undefined) return null;

  const rawVal = regMap[addr];
  const mask = (1 << point.bit_count) - 1;
  const bitValue = (rawVal >> point.bit_offset) & mask;

  return bitValue === point.valid ? 1 : 0;
}

// --------------- 串口管理 ---------------

async function openSerial(serialCfg, timeout) {
  const client = new ModbusRTU();
  await client.connectRTUBuffered(serialCfg.device, {
    baudRate: serialCfg.baud_rate,
    dataBits: serialCfg.data_bits,
    stopBits: serialCfg.stop_bits,
    parity: PARITY_MAP[serialCfg.parity] || 'none',
  });
  client.setTimeout(timeout);
  return client;
}

async function readInverterRegisters(modbusClient, slaveAddr, collectBlocks) {
  modbusClient.setID(slaveAddr);

  const regMap = {};
  for (const block of collectBlocks) {
    const count = block.end_addr - block.start_addr + 1;
    try {
      let result;
      if (block.funcode === 4) {
        result = await modbusClient.readInputRegisters(block.start_addr, count);
      } else {
        result = await modbusClient.readHoldingRegisters(block.start_addr, count);
      }
      if (result && result.data) {
        for (let i = 0; i < result.data.length; i++) {
          regMap[block.start_addr + i] = result.data[i];
        }
      }
    } catch (err) {
      console.error(
        `[Modbus] 读取失败 slave=${slaveAddr} addr=${block.start_addr} count=${count}: ${err.message}`
      );
    }
  }
  return regMap;
}

// --------------- 轮询逻辑 ---------------

async function pollOneInverter(modbusClient, inv, pointTable) {
  if (!pointTable || !pointTable.collect) return;

  const regMap = await readInverterRegisters(
    modbusClient,
    inv.modbus_address,
    pointTable.collect
  );
  if (Object.keys(regMap).length === 0) return;

  const ycChanges = [];
  if (pointTable.yc) {
    for (const pt of pointTable.yc) {
      const value = parseRegValue(regMap, pt);
      if (value === null) continue;

      const rounded = Math.round(value * 10000) / 10000;
      const key = `inv${inv.index}_yc${pt.index}`;
      const lastVal = lastYcValues[key];
      const deadZone = parseFloat(pt.dead_zone) || 0;

      if (lastVal === undefined || Math.abs(rounded - lastVal) > deadZone) {
        lastYcValues[key] = rounded;
        ycChanges.push({
          ycnum: globalIndex(inv.index, pt.index),
          value: rounded,
          name: pt.name,
          unit: '',
          quality: 1,
        });
      }
    }
  }

  const yxChanges = [];
  if (pointTable.yx) {
    for (const pt of pointTable.yx) {
      const status = parseYxStatus(regMap, pt);
      if (status === null) continue;

      const key = `inv${inv.index}_yx${pt.index}`;
      if (lastYxValues[key] !== status) {
        lastYxValues[key] = status;
        yxChanges.push({
          yxnum: globalIndex(inv.index, pt.index),
          value: status,
          name: pt.name,
          quality: 1,
        });
      }
    }
  }

  const now = new Date().toISOString();

  if (ycChanges.length > 0 && mqttClient && mqttClient.connected) {
    const msg = {
      device_id: DEVICE_ID,
      timestamp: now,
      inverters: [{ inverter_id: `inv_${inv.index}`, yc_data: ycChanges }],
    };
    mqttClient.publish(
      `device/${DEVICE_ID}/ycchange`,
      JSON.stringify(msg),
      { qos: 0 }
    );
    console.log(
      `[Modbus] 遥测变化推送: 逆变器${inv.index}, ${ycChanges.length}个点`
    );
  }

  if (yxChanges.length > 0 && mqttClient && mqttClient.connected) {
    const msg = {
      device_id: DEVICE_ID,
      timestamp: now,
      inverters: [{ inverter_id: `inv_${inv.index}`, yx_data: yxChanges }],
    };
    mqttClient.publish(
      `device/${DEVICE_ID}/yxchange`,
      JSON.stringify(msg),
      { qos: 0 }
    );
    console.log(
      `[Modbus] 遥信变化推送: 逆变器${inv.index}, ${yxChanges.length}个点`
    );
  }
}

async function pollAll(serialsData, invertersData, pointTables) {
  if (polling) return;
  polling = true;

  try {
    const groups = {};
    for (const inv of invertersData.inverters) {
      if (!groups[inv.serial_ref]) groups[inv.serial_ref] = [];
      groups[inv.serial_ref].push(inv);
    }

    const promises = [];
    for (const [serialRef, invs] of Object.entries(groups)) {
      const client = serialClients[parseInt(serialRef)];
      if (!client) continue;

      promises.push(
        (async () => {
          for (const inv of invs) {
            const table = pointTables[inv.model];
            if (!table) continue;
            try {
              await pollOneInverter(client, inv, table);
            } catch (err) {
              console.error(
                `[Modbus] 轮询逆变器${inv.index}异常: ${err.message}`
              );
            }
          }
        })()
      );
    }

    await Promise.all(promises);
  } catch (err) {
    console.error(`[Modbus] 轮询异常: ${err.message}`);
  } finally {
    polling = false;
  }
}

// --------------- 遥调指令处理 ---------------

async function handleYtControl(payload, inverters, pointTables) {
  try {
    const { index, value } = JSON.parse(payload.toString());
    console.log(`[Modbus] 收到遥调指令: index=${index}, value=${value}`);

    if (index < 100) {
      console.log('[Modbus] 系统级遥调(index<100)，非 Modbus 范围，跳过');
      return;
    }

    const invIdx = Math.floor(index / 100);
    const ytIdx = index % 100;

    const inv = inverters.find((i) => i.index === invIdx);
    if (!inv) {
      console.error(`[Modbus] 遥调目标逆变器${invIdx}不存在`);
      return;
    }

    const table = pointTables[inv.model];
    if (!table || !table.yt) return;

    const ytPoint = table.yt.find((p) => p.index === ytIdx);
    if (!ytPoint) {
      console.error(
        `[Modbus] 遥调点${ytIdx}在逆变器${invIdx}的点表中不存在`
      );
      return;
    }

    const client = serialClients[inv.serial_ref];
    if (!client) {
      console.error(`[Modbus] 串口${inv.serial_ref}未打开，无法写入`);
      return;
    }

    client.setID(inv.modbus_address);

    const factor = parseFloat(ytPoint.factor) || 1;
    const rawValue = Math.round(value / factor);

    if (ytPoint.data_type === 'U32' || ytPoint.data_type === 'I32') {
      const high = (rawValue >> 16) & 0xffff;
      const low = rawValue & 0xffff;
      await client.writeRegisters(ytPoint.register, [high, low]);
    } else {
      await client.writeRegister(ytPoint.register, rawValue & 0xffff);
    }

    console.log(
      `[Modbus] 遥调写入成功: 逆变器${invIdx}, 寄存器${ytPoint.register}, 值=${rawValue}`
    );
  } catch (err) {
    console.error(`[Modbus] 遥调执行失败: ${err.message}`);
  }
}

// --------------- 启动 / 停止 ---------------

function startPolling(cycle, serialsData, invertersData, pointTables) {
  const activeCount = Object.keys(serialClients).length;
  if (activeCount === 0) {
    console.warn('[Modbus] 没有可用串口，轮询未启动（仅 MQTT 遥调监听生效）');
    return;
  }

  console.log(`[Modbus] 开始轮询 (${activeCount}个串口活跃)`);

  pollAll(serialsData, invertersData, pointTables);

  pollTimer = setInterval(() => {
    pollAll(serialsData, invertersData, pointTables);
  }, cycle);
}

function initModbus() {
  let config, serialsData, invertersData;

  try {
    config = readJSON('config.json');
    serialsData = readJSON('serials.json');
    invertersData = readJSON('inverters.json');
  } catch (err) {
    console.error(`[Modbus] 配置文件读取失败，采集服务未启动: ${err.message}`);
    return;
  }

  const collectCycle = (config.collect?.collect_cycle || 30) * 1000;
  const modbusTimeout = (config.collect?.modbus_timeout || 5) * 1000;

  const pointTables = {};
  for (const inv of invertersData.inverters) {
    if (!pointTables[inv.model]) {
      try {
        pointTables[inv.model] = readJSON(`inverter-tables/${inv.model}.json`);
        console.log(`[Modbus] 点表已加载: ${inv.model}`);
      } catch (e) {
        console.warn(`[Modbus] 点表加载失败: ${inv.model}: ${e.message}`);
      }
    }
  }

  const store = getRealtimeStore();
  for (const inv of invertersData.inverters) {
    const table = pointTables[inv.model];
    if (!table || !table.yt) continue;
    for (const ytPoint of table.yt) {
      const gIdx = globalIndex(inv.index, ytPoint.index);
      if (!store.yt.find((item) => item.index === gIdx)) {
        store.yt.push({
          index: gIdx,
          name: `逆变器${inv.index}-${ytPoint.name}`,
        });
      }
    }
  }
  store.yt.sort((a, b) => a.index - b.index);
  console.log(`[Modbus] 遥调点已注入 realtimeStore: ${store.yt.map((t) => t.index).join(', ')}`);

  mqttClient = mqtt.connect(BROKER, {
    clientId: `collector_modbus_${Date.now()}`,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  });

  mqttClient.on('connect', () => {
    console.log(`[Modbus] MQTT 已连接: ${BROKER}`);
    const ytTopic = `device/${DEVICE_ID}/ytcontrol`;
    mqttClient.subscribe(ytTopic, (err) => {
      if (!err) console.log(`[Modbus] 已订阅遥调主题: ${ytTopic}`);
    });
  });

  mqttClient.on('message', (topic, payload) => {
    if (topic.endsWith('/ytcontrol')) {
      handleYtControl(payload, invertersData.inverters, pointTables);
    }
  });

  mqttClient.on('error', (err) => {
    console.error(`[Modbus] MQTT 错误: ${err.message}`);
  });

  const activeSerials = serialsData.serials.filter((s) => s.mode === 1);
  const serialsWithInverters = activeSerials.filter((s) =>
    invertersData.inverters.some((inv) => inv.serial_ref === s.index)
  );

  if (serialsWithInverters.length === 0) {
    console.log('[Modbus] 没有需要轮询的串口/逆变器配置');
    console.log(
      `[Modbus] 采集服务已启动（仅 MQTT 监听模式，轮询周期: ${collectCycle / 1000}s）`
    );
    return;
  }

  let openCount = 0;
  const totalToOpen = serialsWithInverters.length;

  for (const serial of serialsWithInverters) {
    openSerial(serial, modbusTimeout)
      .then((client) => {
        serialClients[serial.index] = client;
        console.log(
          `[Modbus] 串口已打开: ${serial.device} (${serial.baud_rate}bps)`
        );
      })
      .catch((err) => {
        console.warn(
          `[Modbus] 串口 ${serial.device} 打开失败: ${err.message}`
        );
      })
      .finally(() => {
        openCount++;
        if (openCount >= totalToOpen) {
          startPolling(collectCycle, serialsData, invertersData, pointTables);
        }
      });
  }

  console.log(
    `[Modbus] 采集服务初始化中 (轮询周期: ${collectCycle / 1000}s, 超时: ${modbusTimeout / 1000}s)`
  );
}

function stopModbus() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  for (const [idx, client] of Object.entries(serialClients)) {
    try {
      client.close();
    } catch (_) {}
    delete serialClients[idx];
  }
  if (mqttClient) {
    mqttClient.end();
    mqttClient = null;
  }
  console.log('[Modbus] 采集服务已停止');
}

module.exports = { initModbus, stopModbus };
