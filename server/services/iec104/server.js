/**
 * IEC 60870-5-104 TCP 服务器
 *
 * 管理 TCP 监听、连接生命周期，提供向上层的事件回调
 * 和向连接发送/广播 I 帧的接口。
 */
const net = require('net');
const EventEmitter = require('events');
const IEC104Connection = require('./connection');
const { parseASDU } = require('./protocol');

class IEC104Server extends EventEmitter {
  /**
   * @param {object} options
   * @param {number} options.port - 监听端口（默认 2404）
   * @param {number} [options.casdu=1] - 公共地址
   * @param {object} [options.params] - 协议参数覆盖（k/w/t0-t3）
   */
  constructor(options = {}) {
    super();
    this.port = options.port || 2404;
    this.casdu = options.casdu || 1;
    this.params = options.params || {};
    this.connections = new Map();
    this._server = null;
    this._connIdCounter = 0;
  }

  start() {
    this._server = net.createServer((socket) => {
      this._onConnection(socket);
    });

    this._server.on('error', (err) => {
      console.error(`[IEC104 Server] 错误: ${err.message}`);
      this.emit('error', err);
    });

    this._server.listen(this.port, () => {
      console.log(`[IEC104 Server] 已启动，监听端口 ${this.port}`);
      this.emit('listening');
    });
  }

  stop() {
    for (const [, conn] of this.connections) {
      conn.close();
    }
    this.connections.clear();

    if (this._server) {
      this._server.close();
      this._server = null;
    }
    console.log('[IEC104 Server] 已停止');
  }

  _onConnection(socket) {
    const id = `conn_${++this._connIdCounter}`;
    const addr = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[IEC104 Server] 新连接: ${id} (${addr})`);

    const conn = new IEC104Connection(socket, id, this.params);
    this.connections.set(id, conn);

    conn.on('started', () => {
      this.emit('connectionStarted', id, conn);
    });

    conn.on('stopped', () => {
      this.emit('connectionStopped', id);
    });

    conn.on('asdu', (asduBuf) => {
      const asdu = parseASDU(asduBuf);
      if (asdu) {
        this.emit('asdu', id, asdu, asduBuf);
      }
    });

    conn.on('closed', () => {
      this.connections.delete(id);
      this.emit('connectionClosed', id);
      console.log(`[IEC104 Server] 连接断开: ${id} (${addr}), 当前 ${this.connections.size} 个活跃连接`);
    });

    conn.on('error', () => {
      this.connections.delete(id);
    });
  }

  /**
   * 向指定连接发送 I 帧
   * @param {string} connId
   * @param {Buffer} asduBuffer
   * @returns {boolean}
   */
  sendTo(connId, asduBuffer) {
    const conn = this.connections.get(connId);
    if (!conn) return false;
    return conn.sendIFrame(asduBuffer);
  }

  /**
   * 向所有已激活的连接广播 I 帧
   * @param {Buffer} asduBuffer
   */
  broadcast(asduBuffer) {
    for (const [, conn] of this.connections) {
      if (conn.isStarted) {
        conn.sendIFrame(asduBuffer);
      }
    }
  }

  /**
   * 获取活跃连接数
   */
  get activeCount() {
    let count = 0;
    for (const [, conn] of this.connections) {
      if (conn.isStarted) count++;
    }
    return count;
  }
}

module.exports = IEC104Server;
