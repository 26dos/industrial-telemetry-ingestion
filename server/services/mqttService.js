/**
 * MQTT 硬件通信服务
 *
 * 职责：
 * 1. 连接 MQTT Broker，订阅硬件设备上送的遥测/遥信变化数据
 * 2. 在内存中维护最新的实时数据快照，供 HTTP 接口查询
 * 3. 提供 publish 方法，用于向设备下发遥调指令
 */
const mqtt = require('mqtt');

const BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const DEVICE_ID = process.env.MQTT_DEVICE_ID || '001';

let client = null;

// 实时数据快照
const realtimeStore = {
  yc: [
    { index: 0, inverter: 0, name: 'AGC全站理论有功', value: 0 },
    { index: 1, inverter: 0, name: 'AGC可用容量', value: 0 },
    { index: 2, inverter: 0, name: 'AGC装机容量', value: 0 },
    { index: 3, inverter: 0, name: 'AGC全站有功出力', value: 0 },
    { index: 4, inverter: 0, name: 'AGC控制指令返回值', value: 0 },
    { index: 5, inverter: 0, name: 'AGC总可调上限', value: 0 },
    { index: 6, inverter: 0, name: 'AGC总可调下限', value: 0 },
    { index: 10, inverter: 1, name: '1号逆变器电压', value: 0 },
    { index: 11, inverter: 1, name: '1号逆变器电流', value: 0 },
    { index: 12, inverter: 1, name: '1号逆变器有功功率', value: 0 },
    { index: 13, inverter: 1, name: '1号逆变器无功功率', value: 0 },
    { index: 14, inverter: 1, name: '1号逆变器功率因数', value: 0 },
  ],
  yx: [
    { index: 0, inverter: 0, name: 'AGC投退状态', value: 0 },
    { index: 1, inverter: 0, name: 'AGC远方就地', value: 0 },
    { index: 2, inverter: 0, name: 'AGC增出力闭锁', value: 0 },
    { index: 3, inverter: 0, name: 'AGC减出力闭锁', value: 0 },
    { index: 8, inverter: 1, name: '1号逆变器发电', value: 0 },
    { index: 9, inverter: 1, name: '1号逆变器停机', value: 0 },
    { index: 10, inverter: 1, name: '1号逆变器待机', value: 0 },
  ],
  yt: [
    { index: 0, name: 'AGC有功遥调下发数值' },
    { index: 1, name: 'AVC电压目标值' },
  ],
};

function handleYcChange(payload) {
  try {
    const data = JSON.parse(payload.toString());
    if (!data.inverters) return;
    for (const inv of data.inverters) {
      if (!inv.yc_data) continue;
      for (const point of inv.yc_data) {
        const existing = realtimeStore.yc.find(
          (item) => item.index === point.ycnum
        );
        if (existing) {
          existing.value = point.value;
        }
      }
    }
    console.log(`[MQTT] 遥测变化更新: ${data.inverters.length} 台逆变器`);
  } catch (e) {
    console.error('[MQTT] 遥测变化数据解析失败:', e.message);
  }
}

function handleYxChange(payload) {
  try {
    const data = JSON.parse(payload.toString());
    if (!data.inverters) return;
    for (const inv of data.inverters) {
      if (!inv.yx_data) continue;
      for (const point of inv.yx_data) {
        const existing = realtimeStore.yx.find(
          (item) => item.index === point.yxnum
        );
        if (existing) {
          existing.value = point.value;
        }
      }
    }
    console.log(`[MQTT] 遥信变化更新: ${data.inverters.length} 台逆变器`);
  } catch (e) {
    console.error('[MQTT] 遥信变化数据解析失败:', e.message);
  }
}

function initMqtt() {
  try {
    client = mqtt.connect(BROKER, {
      clientId: `collector_server_${Date.now()}`,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    });

    client.on('connect', () => {
      console.log(`[MQTT] 已连接 Broker: ${BROKER}`);
      const ycTopic = `device/${DEVICE_ID}/ycchange`;
      const yxTopic = `device/${DEVICE_ID}/yxchange`;
      client.subscribe([ycTopic, yxTopic], (err) => {
        if (err) {
          console.error('[MQTT] 订阅失败:', err.message);
        } else {
          console.log(`[MQTT] 已订阅: ${ycTopic}, ${yxTopic}`);
        }
      });
    });

    client.on('message', (topic, payload) => {
      if (topic.endsWith('/ycchange')) {
        handleYcChange(payload);
      } else if (topic.endsWith('/yxchange')) {
        handleYxChange(payload);
      }
    });

    client.on('error', (err) => {
      console.error('[MQTT] 连接错误:', err.message);
    });

    client.on('reconnect', () => {
      console.log('[MQTT] 正在重连...');
    });
  } catch (err) {
    console.warn('[MQTT] 初始化失败（Broker 未启动？），HTTP 接口正常使用:', err.message);
  }
}

function publishControl(index, value) {
  if (!client || !client.connected) {
    console.warn('[MQTT] 未连接 Broker，遥调指令仅本地记录');
    return false;
  }
  const topic = `device/${DEVICE_ID}/ytcontrol`;
  const payload = JSON.stringify({ index, value, timestamp: new Date().toISOString() });
  client.publish(topic, payload, { qos: 1 });
  console.log(`[MQTT] 遥调下发 -> ${topic}:`, payload);
  return true;
}

function getRealtimeStore() {
  return realtimeStore;
}

module.exports = { initMqtt, publishControl, getRealtimeStore };
