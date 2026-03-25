/**
 * IEC 60870-5-104 从站集成服务
 *
 * 将 IEC 104 协议栈与系统业务逻辑连接：
 * - 读取 104 转发点表，建立 IOA ↔ realtimeStore 映射
 * - 处理总召唤（C_IC_NA_1）：返回全部 YC/YX
 * - 处理遥调（C_SE_NC_1 / C_SC_NA_1）：转发到 MQTT
 * - 变化数据主动上送（spontaneous）
 * - 时钟同步（C_CS_NA_1）
 * - 计数器召唤（C_CI_NA_1）
 * - 事件记录（YX 变位带时标）
 */
const fs = require('fs');
const path = require('path');
const IEC104Server = require('./iec104/server');
const proto = require('./iec104/protocol');
const { getRealtimeStore, publishControl } = require('./mqttService');

const DATA_DIR = path.join(__dirname, '../data');

let server = null;
let pointTable = null;  // 当前启用的 104 转发表
let casdu = 1;
let changeTimer = null;
let lastSnapshot = { yc: {}, yx: {} };
let eventBuffer = [];
let eventMaxNum = 64;

// ==================== 配置加载 ====================

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
      console.warn('[IEC104] 未启用任何 104 转发表');
      return null;
    }
    const table = readJSON(`104-tables/${useData.use}.json`);
    console.log(`[IEC104] 点表已加载: ${useData.use}`);
    return table;
  } catch (e) {
    console.error(`[IEC104] 点表加载失败: ${e.message}`);
    return null;
  }
}

// ==================== IOA 映射 ====================

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

// ==================== 总召唤处理 ====================

function handleInterrogation(connId, asdu, rawBuf) {
  if (!pointTable) return;

  const intInfo = proto.parseInterrogation(asdu.infoBuffer);
  console.log(`[IEC104] ${connId} 总召唤 QOI=${intInfo?.qoi || 20}`);

  // ACT_CON
  const actConBuf = proto.buildASDU(
    proto.C_IC_NA_1, proto.COT.ACTCON, casdu,
    asdu.infoBuffer, 1, false
  );
  server.sendTo(connId, actConBuf);

  const store = getRealtimeStore();

  // 发送全部 YC — M_ME_NC_1 (Type 13, COT=20 interrogated)
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

  // 发送全部 YX — M_SP_NA_1 (Type 1, COT=20 interrogated)
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

  console.log(`[IEC104] ${connId} 总召唤完成 (YC: ${pointTable.yc?.length || 0}, YX: ${pointTable.yx?.length || 0})`);
}

// ==================== 计数器召唤处理 ====================

function handleCounterInterrogation(connId, asdu) {
  console.log(`[IEC104] ${connId} 计数器召唤`);

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

// ==================== 时钟同步处理 ====================

function handleClockSync(connId, asdu) {
  const syncInfo = proto.parseClockSync(asdu.infoBuffer);
  console.log(`[IEC104] ${connId} 时钟同步: ${syncInfo?.time?.toISOString()}`);

  // 构建响应：IOA + 当前时间
  const ioaBuf = proto.encodeIOA(0);
  const timeBuf = proto.encodeCP56Time2a(new Date());
  const infoBuf = Buffer.concat([ioaBuf, timeBuf]);

  const actConBuf = proto.buildASDU(
    proto.C_CS_NA_1, proto.COT.ACTCON, casdu,
    infoBuf, 1, false
  );
  server.sendTo(connId, actConBuf);
}

// ==================== 遥调处理 ====================

function handleSetPointFloat(connId, asdu, rawBuf) {
  const cmd = proto.parseSetPointFloat(asdu.infoBuffer);
  if (!cmd) return;

  console.log(`[IEC104] ${connId} 设点命令: IOA=${cmd.ioa}, value=${cmd.value}, select=${cmd.select}`);

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
        console.log(`[IEC104] 遥调转发 MQTT: index=${ytIndex}, value=${realValue}`);
      } else {
        console.warn(`[IEC104] 遥调点 index=${ytIndex} 不在点表中`);
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

  console.log(`[IEC104] ${connId} 单命令: IOA=${cmd.ioa}, value=${cmd.value}, select=${cmd.select}`);

  const actConBuf = proto.buildASDU(
    proto.C_SC_NA_1, proto.COT.ACTCON, casdu,
    asdu.infoBuffer, 1, false
  );
  server.sendTo(connId, actConBuf);

  if (!cmd.select) {
    const ytIndex = ytIOAToIndex(cmd.ioa);
    publishControl(ytIndex, cmd.value);
    console.log(`[IEC104] 单命令转发 MQTT: index=${ytIndex}, value=${cmd.value}`);
  }

  const actTermBuf = proto.buildASDU(
    proto.C_SC_NA_1, proto.COT.ACTTERM, casdu,
    asdu.infoBuffer, 1, false
  );
  server.sendTo(connId, actTermBuf);
}

// ==================== 变化数据上送 ====================

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

  // YC 变化检测
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
    console.log(`[IEC104] 遥测变化上送: ${ycChanges.length} 个点`);
  }

  // YX 变化检测
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

        // 同时记录带时标事件
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
    // 不带时标的变化上送
    const asduBuf = proto.buildM_SP_NA_1(proto.COT.SPONTANEOUS, casdu, yxChanges);
    server.broadcast(asduBuf);

    // 带时标的事件上送
    const tbPoints = yxChanges.map((pt) => ({
      ...pt,
      timestamp: new Date(),
    }));
    const tbAsdu = proto.buildM_SP_TB_1(proto.COT.SPONTANEOUS, casdu, tbPoints);
    server.broadcast(tbAsdu);

    console.log(`[IEC104] 遥信变化上送: ${yxChanges.length} 个点 (含时标事件)`);
  }

  lastSnapshot = current;
}

// ==================== 事件缓冲 ====================

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

// ==================== ASDU 路由 ====================

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
      console.log(`[IEC104] ${connId} 未处理的 TypeID: ${asdu.typeId}`);
      break;
  }
}

// ==================== 初始化 / 停止 ====================

function initIEC104() {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    console.error(`[IEC104] 配置加载失败: ${e.message}`);
    return;
  }

  pointTable = loadPointTable();

  server = new IEC104Server({
    port: cfg.port,
    casdu,
  });

  server.on('connectionStarted', (connId) => {
    // 发送初始化结束 M_EI_NA_1
    const eiAsdu = proto.buildM_EI_NA_1(casdu);
    server.sendTo(connId, eiAsdu);
    console.log(`[IEC104] ${connId} 已发送初始化结束`);
  });

  server.on('asdu', (connId, asdu, rawBuf) => {
    handleASDU(connId, asdu, rawBuf);
  });

  server.on('connectionClosed', (connId) => {
    // 连接断开时无需特殊处理
  });

  server.start();

  // 初始快照
  lastSnapshot = takeSnapshot();

  // 启动变化检测定时器
  changeTimer = setInterval(() => {
    detectAndSendChanges();
  }, cfg.collectCycle);

  console.log(`[IEC104] 从站服务已启动 (端口: ${cfg.port}, 变化检测周期: ${cfg.collectCycle / 1000}s)`);
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
  console.log('[IEC104] 从站服务已停止');
}

module.exports = { initIEC104, stopIEC104, getEvents, clearEvents };
