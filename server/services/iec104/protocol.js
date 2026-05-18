/**
 * IEC 60870-5-104 protocol codec layer
 *
 * Implements APCI/ASDU binary encoding and decoding with zero external dependencies.
 * References:IEC 60870-5-104:2006, IEC 60870-5-101:2003
 */

// ==================== constants ====================

const START_BYTE = 0x68;

// U-frame control bytes
const U_STARTDT_ACT  = 0x07;
const U_STARTDT_CON  = 0x0B;
const U_STOPDT_ACT   = 0x13;
const U_STOPDT_CON   = 0x23;
const U_TESTFR_ACT   = 0x43;
const U_TESTFR_CON   = 0x83;

// ASDU Type ID — monitor direction (slave to master)
const M_SP_NA_1 = 1;   // single-point information (Status Signals)
const M_SP_TB_1 = 30;  // single-point information + CP56Time2a timestamp
const M_ME_NC_1 = 13;  // short floating-point measurement value (Measurements)
const M_ME_TF_1 = 36;  // short floating-point measurement value + CP56Time2a timestamp
const M_EI_NA_1 = 70;  // end of initialization

// ASDU Type ID — control direction (master to slave)
const C_SC_NA_1 = 45;  // single command
const C_SE_NA_1 = 48;  // setpoint command, normalized value
const C_SE_NB_1 = 49;  // setpoint command, scaled value
const C_SE_NC_1 = 50;  // setpoint command, short float

// ASDU Type ID — system commands
const C_IC_NA_1 = 100;  // interrogation
const C_CI_NA_1 = 101;  // counter interrogation
const C_CS_NA_1 = 103;  // clock synchronization

// Cause of Transmission (COT)
const COT = {
  PERIODIC:        1,
  BACKGROUND:      2,
  SPONTANEOUS:     3,
  INITIALIZED:     4,
  REQUEST:         5,
  ACTIVATION:      6,
  ACTCON:          7,
  DEACTIVATION:    8,
  DEACTCON:        9,
  ACTTERM:        10,
  RETREM:         11,
  RETLOC:         12,
  FILE_TRANSFER:  13,
  INTERROGATED:   20,
  INTERROGATED_G1: 21,
  REQCOGEN:       37,
  UNKNOWN_TYPE:   44,
  UNKNOWN_COT:    45,
  UNKNOWN_CASDU:  46,
  UNKNOWN_IOA:    47,
};

// Quality descriptor bits
const QDS_OV = 0x01;  // overflow
const QDS_BL = 0x10;  // blocked
const QDS_SB = 0x20;  // substituted
const QDS_NT = 0x40;  // not topical
const QDS_IV = 0x80;  // invalid

// IOA base addresses (power-industry convention)
const IOA_BASE_YC = 0x4001;  // 16385
const IOA_BASE_YX = 0x0001;  // 1
const IOA_BASE_YT = 0x6001;  // 24577

// Frame format identifiers
const FRAME_U = 'U';
const FRAME_S = 'S';
const FRAME_I = 'I';

// ==================== APCI encoding ====================

function buildUFrame(ctrlByte) {
  const buf = Buffer.alloc(6);
  buf[0] = START_BYTE;
  buf[1] = 4; // length
  buf[2] = ctrlByte;
  buf[3] = 0;
  buf[4] = 0;
  buf[5] = 0;
  return buf;
}

function buildSFrame(rxSeq) {
  const buf = Buffer.alloc(6);
  buf[0] = START_BYTE;
  buf[1] = 4;
  buf[2] = 0x01; // S-frame marker
  buf[3] = 0;
  buf[4] = (rxSeq << 1) & 0xFF;
  buf[5] = (rxSeq >> 7) & 0xFF;
  return buf;
}

function buildIFrame(txSeq, rxSeq, asduBuffer) {
  const len = 4 + asduBuffer.length;
  const buf = Buffer.alloc(6 + asduBuffer.length);
  buf[0] = START_BYTE;
  buf[1] = len;
  buf[2] = (txSeq << 1) & 0xFF;
  buf[3] = (txSeq >> 7) & 0xFF;
  buf[4] = (rxSeq << 1) & 0xFF;
  buf[5] = (rxSeq >> 7) & 0xFF;
  asduBuffer.copy(buf, 6);
  return buf;
}

// ==================== ASDU encoding ====================

function encodeFloat(value) {
  const buf = Buffer.alloc(4);
  buf.writeFloatLE(value, 0);
  return buf;
}

function decodeFloat(buffer, offset) {
  return buffer.readFloatLE(offset);
}

function encodeCP56Time2a(date) {
  const d = date || new Date();
  const buf = Buffer.alloc(7);
  const ms = d.getMilliseconds() + d.getSeconds() * 1000;
  buf.writeUInt16LE(ms, 0);
  buf[2] = d.getMinutes() & 0x3F;
  buf[3] = d.getHours() & 0x1F;
  buf[4] = (d.getDate() & 0x1F) | ((d.getDay() & 0x07) << 5);
  buf[5] = (d.getMonth() + 1) & 0x0F;
  buf[6] = (d.getFullYear() - 2000) & 0x7F;
  return buf;
}

function decodeCP56Time2a(buffer, offset) {
  const ms = buffer.readUInt16LE(offset);
  const min = buffer[offset + 2] & 0x3F;
  const hour = buffer[offset + 3] & 0x1F;
  const day = buffer[offset + 4] & 0x1F;
  const month = (buffer[offset + 5] & 0x0F) - 1;
  const year = 2000 + (buffer[offset + 6] & 0x7F);
  const seconds = Math.floor(ms / 1000);
  const millis = ms % 1000;
  return new Date(year, month, day, hour, min, seconds, millis);
}

function encodeIOA(ioa) {
  const buf = Buffer.alloc(3);
  buf[0] = ioa & 0xFF;
  buf[1] = (ioa >> 8) & 0xFF;
  buf[2] = (ioa >> 16) & 0xFF;
  return buf;
}

function decodeIOA(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

/**
 * Build an ASDU
 * @param {number} typeId - ASDU type identifier
 * @param {number} cot - cause of transmission
 * @param {number} casdu - common address
 * @param {Buffer} infoObjectsBuffer - encoded information-object bytes
 * @param {number} numObjects - number of information objects
 * @param {boolean} sq - SQ bit for sequential IOA
 * @param {number} [origAddr=0] - originator address
 */
function buildASDU(typeId, cot, casdu, infoObjectsBuffer, numObjects, sq, origAddr) {
  const buf = Buffer.alloc(6 + infoObjectsBuffer.length);
  buf[0] = typeId;
  buf[1] = (sq ? 0x80 : 0) | (numObjects & 0x7F);
  buf[2] = cot & 0xFF;
  buf[3] = (origAddr || 0) & 0xFF;
  buf.writeUInt16LE(casdu & 0xFFFF, 4);
  infoObjectsBuffer.copy(buf, 6);
  return buf;
}

// ==================== monitor-direction ASDU builders ====================

/**
 * M_SP_NA_1 (Type 1) — single-point information (Status Signals)，without timestamp
 * @param {Array<{ioa: number, value: number, quality: number}>} points
 */
function buildM_SP_NA_1(cot, casdu, points) {
  const parts = [];
  for (const pt of points) {
    parts.push(encodeIOA(pt.ioa));
    const siq = (pt.value ? 0x01 : 0x00) | ((pt.quality || 0) & 0xF0);
    parts.push(Buffer.from([siq]));
  }
  return buildASDU(M_SP_NA_1, cot, casdu, Buffer.concat(parts), points.length, false);
}

/**
 * M_SP_TB_1 (Type 30) — single-point information + CP56Time2a timestamp
 */
function buildM_SP_TB_1(cot, casdu, points) {
  const parts = [];
  for (const pt of points) {
    parts.push(encodeIOA(pt.ioa));
    const siq = (pt.value ? 0x01 : 0x00) | ((pt.quality || 0) & 0xF0);
    parts.push(Buffer.from([siq]));
    parts.push(encodeCP56Time2a(pt.timestamp || new Date()));
  }
  return buildASDU(M_SP_TB_1, cot, casdu, Buffer.concat(parts), points.length, false);
}

/**
 * M_ME_NC_1 (Type 13) — short floating-point measurement value (Measurements)，without timestamp
 */
function buildM_ME_NC_1(cot, casdu, points) {
  const parts = [];
  for (const pt of points) {
    parts.push(encodeIOA(pt.ioa));
    parts.push(encodeFloat(pt.value));
    parts.push(Buffer.from([pt.quality || 0x00]));
  }
  return buildASDU(M_ME_NC_1, cot, casdu, Buffer.concat(parts), points.length, false);
}

/**
 * M_ME_TF_1 (Type 36) — short floating-point measurement value + CP56Time2a timestamp
 */
function buildM_ME_TF_1(cot, casdu, points) {
  const parts = [];
  for (const pt of points) {
    parts.push(encodeIOA(pt.ioa));
    parts.push(encodeFloat(pt.value));
    parts.push(Buffer.from([pt.quality || 0x00]));
    parts.push(encodeCP56Time2a(pt.timestamp || new Date()));
  }
  return buildASDU(M_ME_TF_1, cot, casdu, Buffer.concat(parts), points.length, false);
}

/**
 * M_EI_NA_1 (Type 70) — end of initialization
 */
function buildM_EI_NA_1(casdu) {
  const ioa = encodeIOA(0);
  const coi = Buffer.from([0x00]); // COI: 0=local manual reset
  return buildASDU(M_EI_NA_1, COT.INITIALIZED, casdu, Buffer.concat([ioa, coi]), 1, false);
}

// ==================== control-direction ASDU acknowledgement ====================

/**
 * Build control-command ACT_CON / ACT_TERM Confirm
 */
function buildControlConfirm(typeId, cot, casdu, infoBuffer) {
  return buildASDU(typeId, cot, casdu, infoBuffer, 1, false);
}

// ==================== APCI decoding ====================

/**
 * Parse an APDU frame from a TCP stream
 * @param {Buffer} buffer - from 0x68 complete APDU starting at 0x68
 * @returns {{ type: string, ctrl: object, asdu: Buffer|null, length: number }}
 */
function parseAPDU(buffer) {
  if (buffer.length < 6) return null;
  if (buffer[0] !== START_BYTE) return null;

  const apduLen = buffer[1];
  const totalLen = apduLen + 2;
  if (buffer.length < totalLen) return null;

  const ctrl1 = buffer[2];
  const ctrl2 = buffer[3];
  const ctrl3 = buffer[4];
  const ctrl4 = buffer[5];

  let result = { length: totalLen };

  if ((ctrl1 & 0x03) === 0x03) {
    // U-frame
    result.type = FRAME_U;
    result.ctrl = { byte: ctrl1 };
  } else if ((ctrl1 & 0x01) === 0x01) {
    // S-frame
    result.type = FRAME_S;
    result.ctrl = {
      rxSeq: (ctrl3 | (ctrl4 << 8)) >> 1,
    };
  } else {
    // I-frame
    result.type = FRAME_I;
    result.ctrl = {
      txSeq: (ctrl1 | (ctrl2 << 8)) >> 1,
      rxSeq: (ctrl3 | (ctrl4 << 8)) >> 1,
    };
    if (apduLen > 4) {
      result.asdu = buffer.slice(6, totalLen);
    }
  }

  return result;
}

/**
 * Parse ASDU
 * @param {Buffer} asduBuf
 * @returns {{ typeId, sq, numObjects, cot, origAddr, casdu, infoBuffer }}
 */
function parseASDU(asduBuf) {
  if (!asduBuf || asduBuf.length < 6) return null;

  const typeId = asduBuf[0];
  const vsq = asduBuf[1];
  const sq = !!(vsq & 0x80);
  const numObjects = vsq & 0x7F;
  const cot = asduBuf[2] & 0x3F;
  const negative = !!(asduBuf[2] & 0x40);
  const test = !!(asduBuf[2] & 0x80);
  const origAddr = asduBuf[3];
  const casdu = asduBuf.readUInt16LE(4);
  const infoBuffer = asduBuf.slice(6);

  return { typeId, sq, numObjects, cot, negative, test, origAddr, casdu, infoBuffer };
}

/**
 * from C_SE_NC_1 (Type 50) information object body
 */
function parseSetPointFloat(infoBuffer) {
  if (infoBuffer.length < 8) return null;
  const ioa = decodeIOA(infoBuffer, 0);
  const value = decodeFloat(infoBuffer, 3);
  const qos = infoBuffer[7];
  const select = !!(qos & 0x80);
  return { ioa, value, select, qos };
}

/**
 * from C_SC_NA_1 (Type 45) single-command information object body
 */
function parseSingleCommand(infoBuffer) {
  if (infoBuffer.length < 4) return null;
  const ioa = decodeIOA(infoBuffer, 0);
  const sco = infoBuffer[3];
  const scs = sco & 0x01;
  const select = !!(sco & 0x80);
  return { ioa, value: scs, select, sco };
}

/**
 * from C_IC_NA_1 (Type 100) interrogation qualifier information object body
 */
function parseInterrogation(infoBuffer) {
  if (infoBuffer.length < 4) return null;
  const ioa = decodeIOA(infoBuffer, 0);
  const qoi = infoBuffer[3]; // 20 = station interrogation
  return { ioa, qoi };
}

/**
 * from C_CI_NA_1 (Type 101) counter interrogation qualifier information object body
 */
function parseCounterInterrogation(infoBuffer) {
  if (infoBuffer.length < 4) return null;
  const ioa = decodeIOA(infoBuffer, 0);
  const qcc = infoBuffer[3];
  return { ioa, qcc };
}

/**
 * from C_CS_NA_1 (Type 103) clock information object body
 */
function parseClockSync(infoBuffer) {
  if (infoBuffer.length < 10) return null;
  const ioa = decodeIOA(infoBuffer, 0);
  const time = decodeCP56Time2a(infoBuffer, 3);
  return { ioa, time };
}

module.exports = {
  START_BYTE,
  U_STARTDT_ACT, U_STARTDT_CON,
  U_STOPDT_ACT, U_STOPDT_CON,
  U_TESTFR_ACT, U_TESTFR_CON,
  M_SP_NA_1, M_SP_TB_1, M_ME_NC_1, M_ME_TF_1, M_EI_NA_1,
  C_SC_NA_1, C_SE_NA_1, C_SE_NB_1, C_SE_NC_1,
  C_IC_NA_1, C_CI_NA_1, C_CS_NA_1,
  COT, IOA_BASE_YC, IOA_BASE_YX, IOA_BASE_YT,
  FRAME_U, FRAME_S, FRAME_I,
  buildUFrame, buildSFrame, buildIFrame,
  buildASDU, buildControlConfirm,
  buildM_SP_NA_1, buildM_SP_TB_1,
  buildM_ME_NC_1, buildM_ME_TF_1,
  buildM_EI_NA_1,
  encodeFloat, decodeFloat,
  encodeIOA, decodeIOA,
  encodeCP56Time2a, decodeCP56Time2a,
  parseAPDU, parseASDU,
  parseSetPointFloat, parseSingleCommand,
  parseInterrogation, parseCounterInterrogation, parseClockSync,
};
