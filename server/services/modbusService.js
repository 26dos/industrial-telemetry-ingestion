/**
 * Modbus RTU collection service
 *
 * Polls inverter Modbus registers over RS485 serial ports and parses measurement/status data，
 * Publishes changes over MQTT and subscribes to setpoint topics before writing Modbus registers.
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

// --------------- utility functions ---------------

function readJSON(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf-8'));
}

/**
 * Map inverter point-table indexes to global indexes to avoid collisions across inverters
 * rule:inverter.index * 100 + point.index
 */
function globalIndex(inverterIdx, pointIdx) {
  return inverterIdx * 100 + pointIdx;
}

// --------------- register value parsing ---------------

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

// --------------- Serial Port Management ---------------

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
        `[Modbus] read failed slave=${slaveAddr} addr=${block.start_addr} count=${count}: ${err.message}`
      );
    }
  }
  return regMap;
}

// --------------- polling loop ---------------

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
      `device/${DEVICE_ID}/yc/change`,
      JSON.stringify(msg),
      { qos: 0 }
    );
    console.log(
      `[Modbus] measurement changes published: Inverter${inv.index}, ${ycChanges.length} points`
    );
  }

  if (yxChanges.length > 0 && mqttClient && mqttClient.connected) {
    const msg = {
      device_id: DEVICE_ID,
      timestamp: now,
      inverters: [{ inverter_id: `inv_${inv.index}`, yx_data: yxChanges }],
    };
    mqttClient.publish(
      `device/${DEVICE_ID}/yx/change`,
      JSON.stringify(msg),
      { qos: 0 }
    );
    console.log(
      `[Modbus] status changes published: Inverter${inv.index}, ${yxChanges.length} points`
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
                `[Modbus] polling inverter ${inv.index}error: ${err.message}`
              );
            }
          }
        })()
      );
    }

    await Promise.all(promises);
  } catch (err) {
    console.error(`[Modbus] polling error: ${err.message}`);
  } finally {
    polling = false;
  }
}

// --------------- setpoint command handling ---------------

async function handleYtControl(payload, inverters, pointTables) {
  try {
    const { index, value } = JSON.parse(payload.toString());
    console.log(`[Modbus] received setpoint command: index=${index}, value=${value}`);

    if (index < 100) {
      console.log('[Modbus] system-level setpoint (index < 100), outside Modbus range, skipped');
      return;
    }

    const invIdx = Math.floor(index / 100);
    const ytIdx = index % 100;

    const inv = inverters.find((i) => i.index === invIdx);
    if (!inv) {
      console.error(`[Modbus] setpoint target inverter ${invIdx}does not exist`);
      return;
    }

    const table = pointTables[inv.model];
    if (!table || !table.yt) return;

    const ytPoint = table.yt.find((p) => p.index === ytIdx);
    if (!ytPoint) {
      console.error(
        `[Modbus] setpoint ${ytIdx} in inverter ${invIdx} is missing from the point table`
      );
      return;
    }

    const client = serialClients[inv.serial_ref];
    if (!client) {
      console.error(`[Modbus] Serial port${inv.serial_ref} is not open; cannot write`);
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
      `[Modbus] setpoint write succeeded: Inverter${invIdx}, Register${ytPoint.register}, Value=${rawValue}`
    );
  } catch (err) {
    console.error(`[Modbus] setpoint execution failed: ${err.message}`);
  }
}

// --------------- start / stop ---------------

function startPolling(cycle, serialsData, invertersData, pointTables) {
  const activeCount = Object.keys(serialClients).length;
  if (activeCount === 0) {
    console.warn('[Modbus] no usable serial port; polling did not start (MQTT setpoint listener only)');
    return;
  }

  console.log(`[Modbus] started polling (${activeCount} active serial ports)`);

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
    console.error(`[Modbus] config file read failed; collection service did not start: ${err.message}`);
    return;
  }

  const collectCycle = (config.collect?.collect_cycle || 30) * 1000;
  const modbusTimeout = (config.collect?.modbus_timeout || 5) * 1000;

  const pointTables = {};
  for (const inv of invertersData.inverters) {
    if (!pointTables[inv.model]) {
      try {
        pointTables[inv.model] = readJSON(`inverter-tables/${inv.model}.json`);
        console.log(`[Modbus] point table loaded: ${inv.model}`);
      } catch (e) {
        console.warn(`[Modbus] point table load failed: ${inv.model}: ${e.message}`);
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
          name: `Inverter${inv.index}-${ytPoint.name}`,
        });
      }
    }
  }
  store.yt.sort((a, b) => a.index - b.index);
  console.log(`[Modbus] setpoints injected into realtimeStore: ${store.yt.map((t) => t.index).join(', ')}`);

  mqttClient = mqtt.connect(BROKER, {
    clientId: `collector_modbus_${Date.now()}`,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  });

  mqttClient.on('connect', () => {
    console.log(`[Modbus] MQTT connected: ${BROKER}`);
    const ytTopic = `device/${DEVICE_ID}/ytcontrol`;
    mqttClient.subscribe(ytTopic, (err) => {
      if (!err) console.log(`[Modbus] subscribed to setpoint topic: ${ytTopic}`);
    });
  });

  mqttClient.on('message', (topic, payload) => {
    if (topic.endsWith('/ytcontrol')) {
      handleYtControl(payload, invertersData.inverters, pointTables);
    }
  });

  mqttClient.on('error', (err) => {
    console.error(`[Modbus] MQTT Error: ${err.message}`);
  });

  const activeSerials = serialsData.serials.filter((s) => s.mode === 1);
  const serialsWithInverters = activeSerials.filter((s) =>
    invertersData.inverters.some((inv) => inv.serial_ref === s.index)
  );

  if (serialsWithInverters.length === 0) {
    console.log('[Modbus] no serial port/inverter configuration requires polling');
    console.log(
      `[Modbus] collection service started (MQTT listener mode only, polling interval: ${collectCycle / 1000}s)`
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
          `[Modbus] serial port opened: ${serial.device} (${serial.baud_rate}bps)`
        );
      })
      .catch((err) => {
        console.warn(
          `[Modbus] Serial port ${serial.device} open failed: ${err.message}`
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
    `[Modbus] collection service initializing (polling interval: ${collectCycle / 1000}s, Timeout: ${modbusTimeout / 1000}s)`
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
  console.log('[Modbus] collection service stopped');
}

module.exports = { initModbus, stopModbus };
