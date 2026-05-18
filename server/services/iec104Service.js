/**
 * IEC 60870-5-104 slave integration service
 *
 * Connects the IEC 104 protocol stack to application logic:
 * - loads IEC 104 forwarding tables and builds IOA-to-realtimeStore mappings
 * - handleinterrogation (C_IC_NA_1):return all YC/YX
 * - handles setpoints (C_SE_NC_1 / C_SC_NA_1): forwards to MQTT
 * - sends spontaneous change events
 * - clock synchronization (C_CS_NA_1)
 * - counter interrogation (C_CI_NA_1)
 * - records timestamped status-change events
 */
const fs = require('fs');
const path = require('path');
const IEC104Server = require('./iec104/server');
const proto = require('./iec104/protocol');
const { getRealtimeStore, publishControl } = require('./mqttService');

const DATA_DIR = path.join(__dirname, '../data');

let server = null;
let pointTable = null;  // currently enabled IEC 104 forwarding table
let casdu = 1;
let changeTimer = null;
let lastSnapshot = { yc: {}, yx: {} };
let eventBuffer = [];
let eventMaxNum = 64;

// ==================== configuration loading ====================

function readJSON(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf-8'));
}

function loadConfig() {
  const config = readJSON('config.json');
  const serverCfg = config.server || {};
  const port = serverCfg.server_port || 2404;
  const timeout = serverCfg.timeout || 60;
  const collectCycle = (config.collect?.collect_cycle || 30) * 1000;
  eventMaxNum = config.event?.event_max_num || 64;
  return { port, timeout, collectCycle };
}

function loadPointTable() {
  try {
    const useData = readJSON('104-use.json');
    if (!useData.use) {
      console.warn('[IEC104] no IEC 104 forwarding table is enabled');
      return null;
    }
    const table = readJSON(`104-tables/${useData.use}.json`);
    console.log(`[IEC104] point table loaded: ${useData.use}`);
    return table;
  } catch (e) {
    console.error(`[IEC104] point table load failed: ${e.message}`);
    return null;
  }
}

// ==================== IOA mapping ====================

function ycIndexToIOA(index) {
  return proto.IOA_BASE_YC + index;
}

function yxIndexToIOA(index) {
  return proto.IOA_BASE_YX + index;
}

function ytIOAToIndex(ioa) {
  return ioa - proto.IOA_BASE_YT;
}

function ycIOAToIndex(ioa) {
  return ioa - proto.IOA_BASE_YC;
}

function yxIOAToIndex(ioa) {
  return ioa - proto.IOA_BASE_YX;
}

// ==================== interrogation handling ====================

function handleInterrogation(connId, asdu, rawBuf) {
  if (!pointTable) return;

  const intInfo = proto.parseInterrogation(asdu.infoBuffer);
  console.log(`[IEC104] ${connId} interrogation QOI=${intInfo?.qoi || 20}`);

  // ACT_CON
  const actConBuf = proto.buildASDU(
    proto.C_IC_NA_1, proto.COT.ACTCON, casdu,
    asdu.infoBuffer, 1, false
  );
  server.sendTo(connId, actConBuf);

  const store = getRealtimeStore();

  // send all YC — M_ME_NC_1 (Type 13, COT=20 interrogated)
  if (pointTable.yc && pointTable.yc.length > 0) {
    const MAX_POINTS_PER_FRAME = 20;
    for (let i = 0; i < pointTable.yc.length; i += MAX_POINTS_PER_FRAME) {
      const batch = pointTable.yc.slice(i, i + MAX_POINTS_PER_FRAME);
      const points = batch.map((pt) => {
        const storeItem = store.yc.find((s) => s.index === pt.index);
        const rawValue = storeItem ? storeItem.value : 0;
        const factor = pt.factor || 1;
        return {
          ioa: ycIndexToIOA(pt.index),
          value: rawValue * factor,
          quality: 0,
        };
      });
      const asduBuf = proto.buildM_ME_NC_1(proto.COT.INTERROGATED, casdu, points);
      server.sendTo(connId, asduBuf);
    }
  }

  // send all YX — M_SP_NA_1 (Type 1, COT=20 interrogated)
  if (pointTable.yx && pointTable.yx.length > 0) {
    const points = pointTable.yx.map((pt) => {
      const storeItem = store.yx.find((s) => s.index === pt.index);
      return {
        ioa: yxIndexToIOA(pt.index),
        value: storeItem ? storeItem.value : 0,
        quality: 0,
      };
    });
    const asduBuf = proto.buildM_SP_NA_1(proto.COT.INTERROGATED, casdu, points);
    server.sendTo(connId, asduBuf);
  }

  // ACT_TERM
  const actTermBuf = proto.buildASDU(
    proto.C_IC_NA_1, proto.COT.ACTTERM, casdu,
    asdu.infoBuffer, 1, false
  );
  server.sendTo(connId, actTermBuf);

  console.log(`[IEC104] ${connId} interrogation complete (YC: ${pointTable.yc?.length || 0}, YX: ${pointTable.yx?.length || 0})`);
}

// ==================== counter interrogation handling ====================

function handleCounterInterrogation(connId, asdu) {
  console.log(`[IEC104] ${connId} counter interrogation`);

  const actConBuf = proto.buildASDU(
    proto.C_CI_NA_1, proto.COT.ACTCON, casdu,
    asdu.infoBuffer, 1, false
  );
  server.sendTo(connId, actConBuf);

  const actTermBuf = proto.buildASDU(
    proto.C_CI_NA_1, proto.COT.ACTTERM, casdu,
    asdu.infoBuffer, 1, false
  );
  server.sendTo(connId, actTermBuf);
}

// ==================== clock synchronization handling ====================

function handleClockSync(connId, asdu) {
  const syncInfo = proto.parseClockSync(asdu.infoBuffer);
  console.log(`[IEC104] ${connId} clock synchronization: ${syncInfo?.time?.toISOString()}`);

  // build response: IOA plus current time
  const ioaBuf = proto.encodeIOA(0);
  const timeBuf = proto.encodeCP56Time2a(new Date());
  const infoBuf = Buffer.concat([ioaBuf, timeBuf]);

  const actConBuf = proto.buildASDU(
    proto.C_CS_NA_1, proto.COT.ACTCON, casdu,
    infoBuf, 1, false
  );
  server.sendTo(connId, actConBuf);
}

// ==================== setpoint handling ====================

function handleSetPointFloat(connId, asdu, rawBuf) {
  const cmd = proto.parseSetPointFloat(asdu.infoBuffer);
  if (!cmd) return;

  console.log(`[IEC104] ${connId} setpoint command: IOA=${cmd.ioa}, value=${cmd.value}, select=${cmd.select}`);

  // ACT_CON
  const actConBuf = proto.buildASDU(
    proto.C_SE_NC_1, proto.COT.ACTCON, casdu,
    asdu.infoBuffer, 1, false
  );
  server.sendTo(connId, actConBuf);

  if (!cmd.select) {
    const ytIndex = ytIOAToIndex(cmd.ioa);
    if (pointTable && pointTable.yt) {
      const ytPoint = pointTable.yt.find((p) => p.index === ytIndex);
      if (ytPoint) {
        const factor = ytPoint.factor || 1;
        const realValue = factor !== 0 ? cmd.value / factor : cmd.value;
        publishControl(ytIndex, realValue);
        console.log(`[IEC104] forwarded setpoint to MQTT: index=${ytIndex}, value=${realValue}`);
      } else {
        console.warn(`[IEC104] setpoint index=${ytIndex} is not present in the point table`);
      }
    }
  }

  // ACT_TERM
  const actTermBuf = proto.buildASDU(
    proto.C_SE_NC_1, proto.COT.ACTTERM, casdu,
    asdu.infoBuffer, 1, false
  );
  server.sendTo(connId, actTermBuf);
}

function handleSingleCommand(connId, asdu) {
  const cmd = proto.parseSingleCommand(asdu.infoBuffer);
  if (!cmd) return;

  console.log(`[IEC104] ${connId} single command: IOA=${cmd.ioa}, value=${cmd.value}, select=${cmd.select}`);

  const actConBuf = proto.buildASDU(
    proto.C_SC_NA_1, proto.COT.ACTCON, casdu,
    asdu.infoBuffer, 1, false
  );
  server.sendTo(connId, actConBuf);

  if (!cmd.select) {
    const ytIndex = ytIOAToIndex(cmd.ioa);
    publishControl(ytIndex, cmd.value);
    console.log(`[IEC104] forwarded single command to MQTT: index=${ytIndex}, value=${cmd.value}`);
  }

  const actTermBuf = proto.buildASDU(
    proto.C_SC_NA_1, proto.COT.ACTTERM, casdu,
    asdu.infoBuffer, 1, false
  );
  server.sendTo(connId, actTermBuf);
}

// ==================== change-data upload ====================

function takeSnapshot() {
  const store = getRealtimeStore();
  const snapshot = { yc: {}, yx: {} };
  for (const item of store.yc) {
    snapshot.yc[item.index] = item.value;
  }
  for (const item of store.yx) {
    snapshot.yx[item.index] = item.value;
  }
  return snapshot;
}

function detectAndSendChanges() {
  if (!pointTable || !server || server.activeCount === 0) return;

  const current = takeSnapshot();
  const store = getRealtimeStore();

  // YC change detection
  const ycChanges = [];
  if (pointTable.yc) {
    for (const pt of pointTable.yc) {
      const curVal = current.yc[pt.index];
      const lastVal = lastSnapshot.yc[pt.index];
      if (curVal !== undefined && curVal !== lastVal) {
        const factor = pt.factor || 1;
        ycChanges.push({
          ioa: ycIndexToIOA(pt.index),
          value: curVal * factor,
          quality: 0,
        });
      }
    }
  }

  if (ycChanges.length > 0) {
    const asduBuf = proto.buildM_ME_NC_1(proto.COT.SPONTANEOUS, casdu, ycChanges);
    server.broadcast(asduBuf);
    console.log(`[IEC104] measurement changes sent: ${ycChanges.length}  points`);
  }

  // YX change detection
  const yxChanges = [];
  if (pointTable.yx) {
    for (const pt of pointTable.yx) {
      const curVal = current.yx[pt.index];
      const lastVal = lastSnapshot.yx[pt.index];
      if (curVal !== undefined && curVal !== lastVal) {
        yxChanges.push({
          ioa: yxIndexToIOA(pt.index),
          value: curVal,
          quality: 0,
        });

        // also record a timestamped event
        addEvent({
          ioa: yxIndexToIOA(pt.index),
          value: curVal,
          quality: 0,
          timestamp: new Date(),
        });
      }
    }
  }

  if (yxChanges.length > 0) {
    // change upload without timestamp
    const asduBuf = proto.buildM_SP_NA_1(proto.COT.SPONTANEOUS, casdu, yxChanges);
    server.broadcast(asduBuf);

    // timestamped event upload
    const tbPoints = yxChanges.map((pt) => ({
      ...pt,
      timestamp: new Date(),
    }));
    const tbAsdu = proto.buildM_SP_TB_1(proto.COT.SPONTANEOUS, casdu, tbPoints);
    server.broadcast(tbAsdu);

    console.log(`[IEC104] status changes sent: ${yxChanges.length}  points (including timestamped events)`);
  }

  lastSnapshot = current;
}

// ==================== event buffer ====================

function addEvent(event) {
  eventBuffer.push(event);
  if (eventBuffer.length > eventMaxNum) {
    eventBuffer.shift();
  }
}

function getEvents() {
  return [...eventBuffer];
}

function clearEvents() {
  eventBuffer = [];
}

// ==================== ASDU routing ====================

function handleASDU(connId, asdu, rawBuf) {
  switch (asdu.typeId) {
    case proto.C_IC_NA_1:
      handleInterrogation(connId, asdu, rawBuf);
      break;
    case proto.C_CI_NA_1:
      handleCounterInterrogation(connId, asdu);
      break;
    case proto.C_CS_NA_1:
      handleClockSync(connId, asdu);
      break;
    case proto.C_SE_NC_1:
      handleSetPointFloat(connId, asdu, rawBuf);
      break;
    case proto.C_SE_NA_1:
    case proto.C_SE_NB_1:
      handleSetPointFloat(connId, asdu, rawBuf);
      break;
    case proto.C_SC_NA_1:
      handleSingleCommand(connId, asdu);
      break;
    default:
      console.log(`[IEC104] ${connId} unhandled TypeID: ${asdu.typeId}`);
      break;
  }
}

// ==================== initialization / stop ====================

function initIEC104() {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    console.error(`[IEC104] configuration load failed: ${e.message}`);
    return;
  }

  pointTable = loadPointTable();

  server = new IEC104Server({
    port: cfg.port,
    casdu,
  });

  server.on('connectionStarted', (connId) => {
    // send end-of-initialization M_EI_NA_1
    const eiAsdu = proto.buildM_EI_NA_1(casdu);
    server.sendTo(connId, eiAsdu);
    console.log(`[IEC104] ${connId} sent end-of-initialization`);
  });

  server.on('asdu', (connId, asdu, rawBuf) => {
    handleASDU(connId, asdu, rawBuf);
  });

  server.on('connectionClosed', (connId) => {
    // no special handling required when the connection closes
  });

  server.start();

  // initial snapshot
  lastSnapshot = takeSnapshot();

  // start change-detection timer
  changeTimer = setInterval(() => {
    detectAndSendChanges();
  }, cfg.collectCycle);

  console.log(`[IEC104] slave service started (port: ${cfg.port}, change-detection interval: ${cfg.collectCycle / 1000}s)`);
}

function stopIEC104() {
  if (changeTimer) {
    clearInterval(changeTimer);
    changeTimer = null;
  }
  if (server) {
    server.stop();
    server = null;
  }
  console.log('[IEC104] slaveservicestopped');
}

module.exports = { initIEC104, stopIEC104, getEvents, clearEvents };
