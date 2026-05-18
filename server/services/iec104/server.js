/**
 * IEC 60870-5-104 TCP server
 *
 * Manages TCP listening, connection lifecycle, and callbacks to upper layers
 * and exposes APIs for sending/broadcasting I-frames.
 */
const net = require('net');
const EventEmitter = require('events');
const IEC104Connection = require('./connection');
const { parseASDU } = require('./protocol');

class IEC104Server extends EventEmitter {
  /**
   * @param {object} options
   * @param {number} options.port - listening port (default 2404)
   * @param {number} [options.casdu=1] - common address
   * @param {object} [options.params] - protocol parameter overrides (k/w/t0-t3)
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
      console.error(`[IEC104 Server] Error: ${err.message}`);
      this.emit('error', err);
    });

    this._server.listen(this.port, () => {
      console.log(`[IEC104 Server] started on port ${this.port}`);
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
    console.log('[IEC104 Server] stopped');
  }

  _onConnection(socket) {
    const id = `conn_${++this._connIdCounter}`;
    const addr = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[IEC104 Server] new connection: ${id} (${addr})`);

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
      console.log(`[IEC104 Server] connection disconnected: ${id} (${addr}), current ${this.connections.size} active connections`);
    });

    conn.on('error', () => {
      this.connections.delete(id);
    });
  }

  /**
   * Send an I-frame to a specific connection
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
   * Broadcast an I-frame to all active connections
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
   * Get active connection count
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
