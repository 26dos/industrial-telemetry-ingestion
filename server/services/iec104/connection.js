/**
 * IEC 60870-5-104 连接状态机
 *
 * 管理单个 TCP 连接的协议交互：I/S/U 帧处理、序号管理、
 * 滑动窗口、心跳定时器、粘包/拆包。
 */
const EventEmitter = require('events');
const {
  START_BYTE, FRAME_U, FRAME_S, FRAME_I,
  U_STARTDT_ACT, U_STARTDT_CON,
  U_STOPDT_ACT, U_STOPDT_CON,
  U_TESTFR_ACT, U_TESTFR_CON,
  buildUFrame, buildSFrame, buildIFrame,
  parseAPDU,
} = require('./protocol');

const STATE_IDLE = 'IDLE';
const STATE_STARTED = 'STARTED';
const STATE_STOPPED = 'STOPPED';

const DEFAULT_PARAMS = {
  k: 12,    // 最大未确认 I 帧数
  w: 8,     // 收到 w 个 I 帧后发 S 确认
  t0: 30,   // TCP 连接超时（秒）
  t1: 15,   // 发送/测试超时
  t2: 10,   // 无数据确认超时
  t3: 20,   // 空闲测试超时
};

class IEC104Connection extends EventEmitter {
  /**
   * @param {net.Socket} socket
   * @param {string} id - 连接标识
   * @param {object} [params] - 协议参数覆盖
   */
  constructor(socket, id, params) {
    super();
    this.socket = socket;
    this.id = id;
    this.state = STATE_IDLE;
    this.params = { ...DEFAULT_PARAMS, ...params };

    this.txSeqNum = 0;
    this.rxSeqNum = 0;
    this.ackSeqNum = 0;
    this.unconfirmedCount = 0;

    this._recvBuf = Buffer.alloc(0);
    this._t1Timer = null;
    this._t2Timer = null;
    this._t3Timer = null;

    this.socket.on('data', (data) => this._onData(data));
    this.socket.on('close', () => this._onClose());
    this.socket.on('error', (err) => this._onError(err));

    this._resetT3();
  }

  get isStarted() {
    return this.state === STATE_STARTED;
  }

  // ==================== 数据接收 ====================

  _onData(data) {
    this._recvBuf = Buffer.concat([this._recvBuf, data]);
    this._processBuffer();
  }

  _processBuffer() {
    while (this._recvBuf.length >= 2) {
      const startIdx = this._recvBuf.indexOf(START_BYTE);
      if (startIdx === -1) {
        this._recvBuf = Buffer.alloc(0);
        return;
      }
      if (startIdx > 0) {
        this._recvBuf = this._recvBuf.slice(startIdx);
      }
      if (this._recvBuf.length < 2) return;

      const apduLen = this._recvBuf[1];
      const totalLen = apduLen + 2;
      if (this._recvBuf.length < totalLen) return;

      const frame = this._recvBuf.slice(0, totalLen);
      this._recvBuf = this._recvBuf.slice(totalLen);

      const parsed = parseAPDU(frame);
      if (!parsed) continue;

      this._resetT3();

      switch (parsed.type) {
        case FRAME_U:
          this._handleUFrame(parsed.ctrl);
          break;
        case FRAME_S:
          this._handleSFrame(parsed.ctrl);
          break;
        case FRAME_I:
          this._handleIFrame(parsed.ctrl, parsed.asdu);
          break;
      }
    }
  }

  // ==================== U-frame 处理 ====================

  _handleUFrame(ctrl) {
    const byte = ctrl.byte;

    if (byte === U_STARTDT_ACT) {
      this.state = STATE_STARTED;
      this.txSeqNum = 0;
      this.rxSeqNum = 0;
      this.ackSeqNum = 0;
      this.unconfirmedCount = 0;
      this._send(buildUFrame(U_STARTDT_CON));
      this.emit('started');
      console.log(`[IEC104] ${this.id} STARTDT 已激活`);
    } else if (byte === U_STOPDT_ACT) {
      this.state = STATE_STOPPED;
      this._send(buildUFrame(U_STOPDT_CON));
      this.emit('stopped');
      console.log(`[IEC104] ${this.id} STOPDT 已停止`);
    } else if (byte === U_TESTFR_ACT) {
      this._send(buildUFrame(U_TESTFR_CON));
    } else if (byte === U_TESTFR_CON) {
      this._clearT1();
    }
  }

  // ==================== S-frame 处理 ====================

  _handleSFrame(ctrl) {
    this._ackSentFrames(ctrl.rxSeq);
  }

  // ==================== I-frame 处理 ====================

  _handleIFrame(ctrl, asduBuf) {
    if (this.state !== STATE_STARTED) return;

    this._ackSentFrames(ctrl.rxSeq);

    if (ctrl.txSeq !== this.rxSeqNum) {
      console.warn(`[IEC104] ${this.id} 序号不匹配: 期望 ${this.rxSeqNum}, 收到 ${ctrl.txSeq}`);
    }

    this.rxSeqNum = (ctrl.txSeq + 1) & 0x7FFF;
    this.unconfirmedCount++;

    if (this.unconfirmedCount >= this.params.w) {
      this.sendSFrame();
    } else {
      this._resetT2();
    }

    if (asduBuf) {
      this.emit('asdu', asduBuf);
    }
  }

  // ==================== 发送方法 ====================

  sendIFrame(asduBuffer) {
    if (this.state !== STATE_STARTED) return false;

    const frame = buildIFrame(this.txSeqNum, this.rxSeqNum, asduBuffer);
    this.txSeqNum = (this.txSeqNum + 1) & 0x7FFF;
    this.ackSeqNum++;
    this._clearT2();
    this.unconfirmedCount = 0;
    this._send(frame);
    this._resetT1();
    return true;
  }

  sendSFrame() {
    const frame = buildSFrame(this.rxSeqNum);
    this._send(frame);
    this._clearT2();
    this.unconfirmedCount = 0;
  }

  _send(buffer) {
    if (this.socket && !this.socket.destroyed) {
      try {
        this.socket.write(buffer);
      } catch (e) {
        console.error(`[IEC104] ${this.id} 发送失败:`, e.message);
      }
    }
  }

  // ==================== 确认处理 ====================

  _ackSentFrames(rxSeq) {
    this.ackSeqNum = 0;
    this._clearT1();
  }

  // ==================== 定时器 ====================

  _resetT1() {
    this._clearT1();
    this._t1Timer = setTimeout(() => {
      console.warn(`[IEC104] ${this.id} T1 超时，关闭连接`);
      this.close();
    }, this.params.t1 * 1000);
  }

  _clearT1() {
    if (this._t1Timer) {
      clearTimeout(this._t1Timer);
      this._t1Timer = null;
    }
  }

  _resetT2() {
    this._clearT2();
    this._t2Timer = setTimeout(() => {
      if (this.unconfirmedCount > 0) {
        this.sendSFrame();
      }
    }, this.params.t2 * 1000);
  }

  _clearT2() {
    if (this._t2Timer) {
      clearTimeout(this._t2Timer);
      this._t2Timer = null;
    }
  }

  _resetT3() {
    this._clearT3();
    this._t3Timer = setTimeout(() => {
      this._send(buildUFrame(U_TESTFR_ACT));
      this._resetT1();
    }, this.params.t3 * 1000);
  }

  _clearT3() {
    if (this._t3Timer) {
      clearTimeout(this._t3Timer);
      this._t3Timer = null;
    }
  }

  // ==================== 连接管理 ====================

  _onClose() {
    this._cleanup();
    this.emit('closed');
    console.log(`[IEC104] ${this.id} 连接关闭`);
  }

  _onError(err) {
    console.error(`[IEC104] ${this.id} 错误:`, err.message);
    this._cleanup();
    this.emit('error', err);
  }

  _cleanup() {
    this._clearT1();
    this._clearT2();
    this._clearT3();
    this.state = STATE_IDLE;
  }

  close() {
    this._cleanup();
    if (this.socket && !this.socket.destroyed) {
      this.socket.destroy();
    }
  }
}

module.exports = IEC104Connection;
