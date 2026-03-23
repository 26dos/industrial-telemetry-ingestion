# 通信架构说明 — HTTP / WebSocket / MQTT 三种协议的分工与调用逻辑

---

## 一句话总结

> **HTTP 管配置，MQTT 管硬件，WebSocket 是 MQTT 在浏览器里的传输外壳。**

三者不是并列关系，而是分层关系：

```
HTTP ──── 人（前端页面） ↔ 后端服务器 ──── 配置读写、业务操作
MQTT ──── 后端服务器    ↔ 硬件设备   ──── 实时数据收发
WebSocket ─ 浏览器      ↔ MQTT Broker ──── 让前端也能收 MQTT 消息（浏览器不支持原生 TCP）
```

---

## 二、整体数据流全景图

```
                                    ┌─────────────────────────────┐
                                    │        MQTT Broker          │
                                    │    (Mosquitto / EMQX)       │
                                    │                             │
                                    │   TCP:1883    WS:8083       │
                                    └──┬──────────────┬───────────┘
                                       │              │
                          MQTT(TCP)    │              │  MQTT(WebSocket)
                       ┌───────────────┘              └──────────────────┐
                       │                                                 │
                       ▼                                                 ▼
  ┌─────────────────────────────┐                    ┌────────────────────────────┐
  │      后端 Express 服务       │                    │      前端 Vue 3 浏览器      │
  │                             │                    │                            │
  │  ┌─── mqttService.js ────┐  │     HTTP(POST)     │  ┌─── api/index.js ─────┐  │
  │  │ subscribe: ycchange   │  │◄──────────────────►│  │ axios 27个接口封装     │  │
  │  │ subscribe: yxchange   │  │  配置读写/总召/遥调  │  └─────────────────────┘  │
  │  │ publish:   ytcontrol  │  │                    │                            │
  │  │                       │  │                    │  ┌─── utils/mqtt.js ────┐  │
  │  │ realtimeStore (内存)   │  │                    │  │ subscribe: ycchange  │  │
  │  └───────────────────────┘  │                    │  │ subscribe: yxchange  │  │
  │                             │                    │  │ → watch → 更新UI     │  │
  │  ┌─── routes/ ───────────┐  │                    │  └─────────────────────┘  │
  │  │ /api/getAllData/YC     │──┤── 读 realtimeStore │                            │
  │  │ /api/control/YT       │──┤── 调 publishControl│                            │
  │  │ /api/getConfigInfo    │──┤── 读 config.json   │                            │
  │  │ /api/setSerialInfo    │──┤── 写 serials.json  │                            │
  │  │ ... 共27个             │  │                    │                            │
  │  └───────────────────────┘  │                    │                            │
  └─────────────────────────────┘                    └────────────────────────────┘
                       │
                       │ MQTT(TCP)
                       ▼
  ┌─────────────────────────────┐
  │     采集控制单元（硬件）      │
  │                             │
  │  Modbus 采集逆变器数据       │
  │  104 规约转发到调度          │
  │  publish ycchange/yxchange  │  ← 数据变化时主动上送
  │  subscribe ytcontrol        │  ← 接收遥调指令
  └─────────────────────────────┘
```

---

## 三、三种协议详细说明

### 3.1 HTTP — "人 ↔ 服务器" 的业务通道

**本质：** 请求-响应模式。前端用户点按钮 → 发 HTTP 请求 → 后端处理 → 返回 JSON。

**使用范围：** 27 个业务接口，覆盖所有"配置管理"和"主动查询"场景。

**特点：**
- 统一 POST + JSON body
- 一问一答，前端发起，后端被动响应
- 无法做到"服务器主动推数据给前端"

**分类与对应代码：**

| 类别             | 接口示例                    | 后端文件               | 数据来源       |
|------------------|-----------------------------|------------------------|----------------|
| 配置读写（7组）   | getConfigInfo / setConfigInfo | routes/config.js       | JSON 文件      |
| 网络/Lora（5个）  | getNetwork / restartNetwork   | routes/network.js      | JSON 文件 / 系统命令 |
| 设备管理（6个）   | getSerialInfo / setInverterInfo | routes/serial.js / inverter.js | JSON 文件 |
| 实时数据查询（3个）| getAllData/YC / getAllData/YX  | routes/realtime.js     | **MQTT 内存快照** |
| 遥调下发（1个）   | control/YT                   | routes/realtime.js     | **转发到 MQTT** |
| 点表管理（9个）   | get104List / uploadInverterTableFile | routes/table104.js / pointTable.js | JSON 文件 |
| 系统运维（3个）   | getVersion / restart          | routes/system.js       | OS 信息        |

**关键理解：** 实时数据的 HTTP 接口 (`getAllData/YC` 等) 读的不是文件，而是后端 `mqttService.js` 中的 **内存快照 `realtimeStore`**。这个快照由 MQTT 持续更新。

```
前端点"总召刷新"
    ↓
HTTP POST /api/getAllData/YC
    ↓
routes/realtime.js → getRealtimeStore()
    ↓
返回 mqttService.js 中 realtimeStore.yc 的当前值
```

---

### 3.2 MQTT — "服务器 ↔ 硬件" 的实时数据通道

**本质：** 发布-订阅模式。通过一个中间人（Broker），消息生产者（Publisher）和消费者（Subscriber）解耦。

**使用范围：** 硬件设备数据的实时收发，只有 3 个话题。

**为什么用 MQTT 不用 HTTP：**
- 硬件设备（采集控制单元）是嵌入式 Linux，运行 C/C++ 程序
- 数据是"变化时主动上报"，不是"你问我答"
- MQTT 轻量、低功耗、支持 QoS、自动重连，非常适合工控场景

**话题清单与数据流向：**

| 话题                        | 方向           | 发布者     | 订阅者           | 说明         |
|----------------------------|---------------|-----------|-----------------|-------------|
| `device/001/ycchange`      | 硬件 → 服务器  | 硬件设备   | 后端 + 前端      | 遥测变化上送  |
| `device/001/yxchange`      | 硬件 → 服务器  | 硬件设备   | 后端 + 前端      | 遥信变化上送  |
| `device/001/ytcontrol`     | 服务器 → 硬件  | 后端       | 硬件设备         | 遥调指令下发  |

**后端 MQTT 的两个职责：**

**职责 1：订阅硬件数据，更新内存快照**

```javascript
// server/services/mqttService.js

// 订阅两个话题
client.subscribe(['device/001/ycchange', 'device/001/yxchange']);

// 收到消息 → 更新内存中的 realtimeStore
client.on('message', (topic, payload) => {
  if (topic.endsWith('/ycchange')) {
    // 解析 JSON，按点号更新 realtimeStore.yc[].value
  }
});
```

这样当前端通过 HTTP 调 `getAllData/YC` 时，拿到的就是最新的硬件数据。

**职责 2：转发遥调指令到硬件**

```
前端点"遥调下发"
    ↓
HTTP POST /api/control/YT  { index: 0, value: 50.5 }
    ↓
routes/realtime.js → publishControl(0, 50.5)
    ↓
mqttService.js → client.publish('device/001/ytcontrol', ...)
    ↓
MQTT Broker 转发
    ↓
硬件设备收到指令，执行有功调节
```

---

### 3.3 WebSocket — "MQTT 在浏览器里的运输方式"

**本质：** WebSocket 不是第三种业务协议，它是 **MQTT 的传输层适配**。

**为什么需要 WebSocket：**
- 浏览器不支持原生 TCP 连接
- MQTT 标准端口 1883 用的是 TCP，浏览器打不开
- 所以 MQTT Broker 额外开了 8083 端口，用 WebSocket 封装 MQTT 协议
- 前端的 `mqtt.js` 库通过 `ws://broker:8083/mqtt` 连接，内部说的还是 MQTT 协议

**类比：**
```
TCP  端口 1883 = MQTT 的"公路"  → 后端 Node.js、硬件设备走这条路
WebSocket 端口 8083 = MQTT 的"水路" → 浏览器走这条路（因为浏览器没有公路入口）
```

两条路到的是同一个 Broker，收到的消息完全一样。

**前端 MQTT 做了什么：**

```javascript
// web/src/utils/mqtt.js

// 通过 WebSocket 连接 MQTT Broker
client = mqtt.connect('ws://localhost:8083/mqtt')

// 订阅和后端一样的话题
client.subscribe(['device/001/ycchange', 'device/001/yxchange'])

// 收到消息 → 更新 Vue 响应式变量
client.on('message', (topic, payload) => {
  if (topic.endsWith('/ycchange')) ycUpdates.value = JSON.parse(payload)
  if (topic.endsWith('/yxchange')) yxUpdates.value = JSON.parse(payload)
})
```

```javascript
// web/src/views/RealtimeData.vue

// watch MQTT 推送 → 实时合并到表格数据
watch(ycUpdates, (data) => {
  for (const inv of data.inverters) {
    for (const pt of inv.yc_data) {
      const found = ycData.value.find(item => item.index === pt.ycnum)
      if (found) found.value = pt.value   // 表格中对应行的值自动更新
    }
  }
})
```

---

## 四、一个完整场景串讲

以 **"逆变器电压变化 → 前端表格实时更新 → 操作员下发遥调"** 为例：

```
时间线
──────────────────────────────────────────────────────────────────

[T0] 操作员打开浏览器，访问"实时数据"页面
     │
     ├── 前端 HTTP POST /api/getAllData/YC → 后端返回 realtimeStore 快照
     │   → 表格显示所有遥测点的当前值（可能是旧值或初始 0）
     │
     └── 前端 mqtt.js 通过 ws://broker:8083 连接 MQTT Broker
         → 订阅 device/001/ycchange 和 yxchange

[T1] 硬件采集到1号逆变器电压从 0 变为 220.5V
     │
     └── 硬件 publish → device/001/ycchange
         payload: { inverters: [{ inverter_id: "inv_001",
                    yc_data: [{ ycnum: 10, value: 220.5 }] }] }

[T2] MQTT Broker 收到消息，同时转发给两个订阅者：
     │
     ├── 订阅者1: 后端 mqttService.js
     │   → handleYcChange() → realtimeStore.yc[index=10].value = 220.5
     │   → 下次前端 HTTP 总召时就能拿到 220.5
     │
     └── 订阅者2: 前端浏览器 mqtt.js (通过 WebSocket 收到)
         → ycUpdates.value = {...}
         → watch 触发 → ycData.value[index=10].value = 220.5
         → Vue 响应式 → 表格中"1号逆变器电压"那行自动刷新为 220.5
         → 操作员无需刷新页面，数据实时跳动

[T3] 操作员在"遥调下发"区域输入 AGC 有功 = 50.5，点"下发"
     │
     ├── 前端 HTTP POST /api/control/YT  { index: 0, value: 50.5 }
     │
     ├── 后端 routes/realtime.js → publishControl(0, 50.5)
     │
     ├── 后端 mqttService.js → client.publish('device/001/ytcontrol', ...)
     │
     ├── MQTT Broker 转发
     │
     └── 硬件设备订阅了 device/001/ytcontrol
         → 收到指令 → 通过 Modbus 写逆变器寄存器 → 调节有功出力
```

---

## 五、三种协议对比表

| 维度         | HTTP                      | MQTT (TCP)                | WebSocket (MQTT over WS)   |
|-------------|---------------------------|---------------------------|-----------------------------|
| **谁用**     | 前端浏览器 → 后端           | 后端 ↔ 硬件设备            | 前端浏览器 → MQTT Broker     |
| **通信模式** | 请求-响应（一问一答）        | 发布-订阅（事件驱动）       | 同 MQTT，只是传输层不同       |
| **发起方**   | 前端主动请求                | 硬件主动推送 / 后端主动下发  | 前端被动接收                  |
| **端口**     | 3000（后端服务）            | 1883（Broker TCP）         | 8083（Broker WebSocket）     |
| **协议**     | HTTP/1.1                  | MQTT v3.1.1/v5            | MQTT over WebSocket          |
| **数据格式** | JSON                      | JSON（自定义）             | 同 MQTT                      |
| **用途**     | 配置管理、总召查询、遥调触发  | 硬件数据收发               | 前端实时数据接收               |
| **连接数**   | 每次请求一个连接            | 1 个长连接                 | 1 个长连接                    |
| **接口数量** | 27 个                     | 3 个话题                   | 2 个话题（只订阅，不发布）     |
| **代码位置** | api/index.js + routes/    | services/mqttService.js   | utils/mqtt.js                |

---

## 六、"如果没有 MQTT Broker" 会怎样？

| 功能                | 影响                                      |
|--------------------|------------------------------------------|
| 配置管理（9个页面）   | **正常使用**，全走 HTTP                     |
| 实时数据-总召刷新     | **可用**，但返回初始值 0（无硬件数据填充）     |
| 实时数据-MQTT推送     | **不可用**，页面显示"MQTT 未连接"            |
| 遥调下发             | **HTTP 调用成功**，但指令无法到达硬件设备      |
| 系统信息/点表管理     | **正常使用**                                |

所以：**MQTT 只影响"实时数据"这一个页面的实时推送能力，其余所有功能不受影响。**

---

## 七、为什么前端和后端都订阅了同一个 MQTT 话题？

这是一个冗余设计，各有用途：

| 订阅者   | 作用                                                        |
|---------|-------------------------------------------------------------|
| **后端** | 维护内存快照 → 供 HTTP `getAllData/YC` 接口返回完整数据         |
| **前端** | 变化数据实时合并到 UI → 不需要轮询 HTTP，表格自动刷新            |

如果只有后端订阅：前端需要每秒轮询 `getAllData/YC` 才能看到变化，浪费带宽。  
如果只有前端订阅：后端 HTTP 接口的总召数据就没有最新值，只能返回初始值。  
**两端都订阅：HTTP 有完整快照 + 前端有实时推送，互补。**
