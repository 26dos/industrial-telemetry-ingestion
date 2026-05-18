/**
 * MQTT hardware communication service
 *
 * Responsibilities:
 * 1. Connect to the MQTT broker and subscribe to measurement/status changes from devices
 * 2. Maintain the latest realtime snapshot in memory for HTTP APIs
 * 3. Provide a publish helper for sending setpoint commands to devices
 */
const mqtt = require('mqtt');

const BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const DEVICE_ID = process.env.MQTT_DEVICE_ID || '001';

let client = null;

// Realtime data snapshot
const realtimeStore = {
  yc: [
    { index: 0, inverter: 0, name: 'AGC theoretical plant active power', value: 0 },
    { index: 1, inverter: 0, name: 'AGC available capacity', value: 0 },
    { index: 2, inverter: 0, name: 'AGC installed capacity', value: 0 },
    { index: 3, inverter: 0, name: 'AGC plant active output', value: 0 },
    { index: 4, inverter: 0, name: 'AGC control command return value', value: 0 },
    { index: 5, inverter: 0, name: 'AGC total adjustable upper limit', value: 0 },
    { index: 6, inverter: 0, name: 'AGC total adjustable lower limit', value: 0 },
    { index: 10, inverter: 1, name: 'Inverter 1 voltage', value: 0 },
    { index: 11, inverter: 1, name: 'Inverter 1 current', value: 0 },
    { index: 12, inverter: 1, name: 'Inverter 1 active power', value: 0 },
    { index: 13, inverter: 1, name: 'Inverter 1 reactive power', value: 0 },
    { index: 14, inverter: 1, name: 'Inverter 1 power factor', value: 0 },
  ],
  yx: [
    { index: 0, inverter: 0, name: 'AGC enable state', value: 0 },
    { index: 1, inverter: 0, name: 'AGC remote/local mode', value: 0 },
    { index: 2, inverter: 0, name: 'AGC raise-output lockout', value: 0 },
    { index: 3, inverter: 0, name: 'AGC lower-output lockout', value: 0 },
    { index: 8, inverter: 1, name: 'Inverter 1 generating', value: 0 },
    { index: 9, inverter: 1, name: 'Inverter 1 stopped', value: 0 },
    { index: 10, inverter: 1, name: 'Inverter 1 standby', value: 0 },
  ],
  yt: [
    { index: 0, name: 'AGC active-power setpoint value' },
    { index: 1, name: 'AVC voltage target' },
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
        } else {
          realtimeStore.yc.push({
            index: point.ycnum,
            inverter: Math.floor(point.ycnum / 100) || 0,
            name: point.name || `YC_${point.ycnum}`,
            value: point.value,
          });
          realtimeStore.yc.sort((a, b) => a.index - b.index);
        }
      }
    }
    console.log(`[MQTT] measurement changes updated: ${data.inverters.length} inverters`);
  } catch (e) {
    console.error('[MQTT] measurement change payload parse failed:', e.message);
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
        } else {
          realtimeStore.yx.push({
            index: point.yxnum,
            inverter: Math.floor(point.yxnum / 100) || 0,
            name: point.name || `YX_${point.yxnum}`,
            value: point.value,
          });
          realtimeStore.yx.sort((a, b) => a.index - b.index);
        }
      }
    }
    console.log(`[MQTT] status changes updated: ${data.inverters.length} inverters`);
  } catch (e) {
    console.error('[MQTT] status change payload parse failed:', e.message);
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
      console.log(`[MQTT] connected to broker: ${BROKER}`);
      const ycTopic = `device/${DEVICE_ID}/yc/change`;
      const yxTopic = `device/${DEVICE_ID}/yx/change`;
      client.subscribe([ycTopic, yxTopic], (err) => {
        if (err) {
          console.error('[MQTT] subscribe failed:', err.message);
        } else {
          console.log(`[MQTT] subscribed: ${ycTopic}, ${yxTopic}`);
        }
      });
    });

    client.on('message', (topic, payload) => {
      if (topic.endsWith('/yc/change')) {
        handleYcChange(payload);
      } else if (topic.endsWith('/yx/change')) {
        handleYxChange(payload);
      }
    });

    client.on('error', (err) => {
      console.error('[MQTT] connection error:', err.message);
    });

    client.on('reconnect', () => {
      console.log('[MQTT] reconnecting...');
    });
  } catch (err) {
    console.warn('[MQTT] initialization failed (is the broker down?); HTTP APIs remain available:', err.message);
  }
}

function publishControl(index, value) {
  if (!client || !client.connected) {
    console.warn('[MQTT] broker disconnected; setpoint command recorded locally only');
    return false;
  }
  const topic = `device/${DEVICE_ID}/ytcontrol`;
  const payload = JSON.stringify({ index, value, timestamp: new Date().toISOString() });
  client.publish(topic, payload, { qos: 1 });
  console.log(`[MQTT] Setpoints -> ${topic}:`, payload);
  return true;
}

function getRealtimeStore() {
  return realtimeStore;
}

module.exports = { initMqtt, publishControl, getRealtimeStore };
