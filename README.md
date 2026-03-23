# 采集控制单元配置工具

面向工控机/采集控制单元的 Web 配置与实时监控系统。  
通过 HTTP 接口管理业务配置，通过 MQTT 协议对接硬件设备、收发实时数据。

---

## 系统架构

```
┌─────────────────────────────────────────────────────┐
│                     前端 (Vue 3)                      │
│  Element Plus UI / Axios HTTP / MQTT.js WebSocket    │
└───────┬─────────────────────────────────┬────────────┘
        │ HTTP (POST / JSON)              │ MQTT over WS
        ▼                                 ▼
┌───────────────────┐         ┌────────────────────────┐
│   后端 (Express)   │         │    MQTT Broker          │
│  业务接口 27个      │         │  (Mosquitto / EMQX)    │
│  配置/管理/监控     │◄───────►│  硬件数据收发           │
└───────────────────┘         └────────────────────────┘
        │                                 ▲
        ▼                                 │
┌───────────────────┐         ┌────────────────────────┐
│   本地配置文件      │         │   采集控制单元 (硬件)    │
│  JSON / 点表文件    │         │  逆变器 / 串口 / Lora   │
└───────────────────┘         └────────────────────────┘
```

---

## 技术栈

| 层级     | 技术                                    |
|----------|----------------------------------------|
| 前端     | Vue 3 + Vite + Element Plus + Vue Router + Pinia |
| HTTP 通信 | Axios（统一 POST + JSON body）           |
| 实时数据  | MQTT.js（浏览器端 WebSocket 连接 Broker） |
| 后端     | Node.js + Express                       |
| MQTT 服务 | mqtt.js（后端订阅/发布硬件数据）          |
| 文件上传  | multer                                  |

---

## 项目结构

```
Collector/
├── README.md
├── server/                     # 后端服务
│   ├── package.json
│   ├── app.js                  # 入口
│   ├── data/                   # 模拟数据/配置文件
│   │   ├── config.json
│   │   ├── network.json
│   │   ├── serials.json
│   │   ├── inverters.json
│   │   ├── inverter-tables/    # 逆变器点表文件
│   │   └── 104-tables/         # 104转发表文件
│   ├── routes/                 # HTTP 路由
│   │   ├── config.js           # 系统配置
│   │   ├── network.js          # 网络配置
│   │   ├── lora.js             # 无线配置
│   │   ├── serial.js           # 串口管理
│   │   ├── inverter.js         # 逆变器管理
│   │   ├── realtime.js         # 实时数据 (104)
│   │   ├── pointTable.js       # 设备点表管理
│   │   ├── table104.js         # 104点表管理
│   │   └── system.js           # 系统信息
│   └── services/
│       └── mqttService.js      # MQTT 硬件通信服务
│
└── web/                        # 前端应用
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.js
        ├── App.vue
        ├── router/index.js
        ├── stores/             # Pinia 状态管理
        ├── api/                # HTTP 接口封装
        │   └── index.js
        ├── utils/
        │   └── mqtt.js         # MQTT 实时数据客户端
        ├── layout/
        │   └── MainLayout.vue
        └── views/              # 页面组件
            ├── Login.vue
            ├── SystemConfig.vue
            ├── NetworkConfig.vue
            ├── LoraConfig.vue
            ├── SerialManage.vue
            ├── InverterManage.vue
            ├── RealtimeData.vue
            ├── PointTable.vue
            ├── Table104.vue
            └── SystemInfo.vue
```

---

## 功能模块

| 序号 | 模块          | 描述                                              | 通信方式  | 优先级 |
|------|--------------|---------------------------------------------------|----------|--------|
| 1    | 登录          | 前端固定口令验证，无后端接口                         | 前端本地  | 高     |
| 2    | 系统配置      | 采集/服务/调控/事件/日志参数的查看与修改               | HTTP     | 高     |
| 3    | 网络配置      | 工控机 IP/子网掩码/网关配置，重启网络                 | HTTP     | 高     |
| 4    | 无线配置      | Lora 主节点参数（自研板卡版本支持）                   | HTTP     | 中     |
| 5    | 串口管理      | 串口 CRUD（波特率/数据位/停止位/校验/模式等）          | HTTP     | 高     |
| 6    | 逆变器管理    | 逆变器 CRUD（Modbus地址/Lora地址/协议/型号等）        | HTTP     | 高     |
| 7    | 实时数据(104) | 遥测/遥信总召、遥调下发、变化实时推送                  | HTTP+MQTT | 高    |
| 8    | 设备点表      | 逆变器点表列表/详情/上传/删除                         | HTTP     | 高     |
| 9    | 104点表       | 104 转发表列表/详情/选择/上传/删除                    | HTTP     | 高     |
| 10   | 报文检测      | 104/Modbus 报文查看                                | HTTP     | 低     |
| 11   | 系统信息      | 版本号、CPU/内存使用率、重启服务                      | HTTP     | 中     |

---

## HTTP 接口总览（27 个，统一 POST + JSON）

### 系统配置
| 接口                       | 描述           |
|---------------------------|---------------|
| `POST /api/getConfigInfo`  | 获取系统配置    |
| `POST /api/setConfigInfo`  | 保存系统配置    |

### 网络配置
| 接口                        | 描述           |
|----------------------------|---------------|
| `POST /api/getNetwork`      | 获取网络信息    |
| `POST /api/setNetwork`      | 保存网络信息    |
| `POST /api/restartNetwork`  | 重启网络       |

### 无线配置 (Lora)
| 接口                       | 描述           |
|---------------------------|---------------|
| `POST /api/getLoraInfo`    | 获取 Lora 配置  |
| `POST /api/setLoraInfo`    | 保存 Lora 配置  |

### 串口管理
| 接口                       | 描述             |
|---------------------------|-----------------|
| `POST /api/getSerialInfo`  | 获取串口配置列表  |
| `POST /api/setSerialInfo`  | 保存串口配置      |
| `POST /api/getSerialMax`   | 获取串口最大数量  |

### 逆变器管理
| 接口                         | 描述               |
|-----------------------------|-------------------|
| `POST /api/getInverterInfo`  | 获取逆变器配置列表  |
| `POST /api/setInverterInfo`  | 保存逆变器配置      |
| `POST /api/getInverterMax`   | 获取逆变器最大数量  |

### 实时数据 (104)
| 接口                          | 描述           |
|------------------------------|---------------|
| `POST /api/getAllData/YC`     | 总召遥测数据    |
| `POST /api/getAllData/YX`     | 总召遥信数据    |
| `POST /api/getControlList/YT` | 获取遥调控制列表 |
| `POST /api/control/YT`       | 遥调下发       |

### 设备点表
| 接口                                  | 描述                |
|--------------------------------------|-------------------|
| `POST /api/getInverterTableList`      | 获取逆变器点表列表   |
| `POST /api/getInverterTableInfo`      | 获取逆变器点表详情   |
| `POST /api/uploadInverterTableFile`   | 上传逆变器点表文件   |
| `POST /api/deleteInverterTableFile`   | 删除逆变器点表文件   |

### 104 点表
| 接口                        | 描述                  |
|----------------------------|-----------------------|
| `POST /api/get104List`      | 获取 104 转发表列表    |
| `POST /api/get104Info`      | 获取 104 转发表详情    |
| `POST /api/set104File`      | 设置使用的 104 转发表  |
| `POST /api/upload104File`   | 上传 104 转发表文件    |
| `POST /api/delete104File`   | 删除 104 转发表文件    |

### 系统信息
| 接口                       | 描述             |
|---------------------------|-----------------|
| `POST /api/getVersion`     | 获取程序版本      |
| `POST /api/getSystemInfo`  | 获取系统资源信息   |
| `POST /api/restart`        | 重启服务          |

---

## MQTT 接口（硬件 → 前端 实时推送）

| 话题                       | 方向         | 描述                |
|---------------------------|-------------|-------------------|
| `device/{id}/ycchange`    | 硬件 → 前端  | 遥测变化上送         |
| `device/{id}/yxchange`    | 硬件 → 前端  | 遥信变化上送         |

Payload 结构：
```json
{
  "device_id": "data_collector_001",
  "timestamp": "2026-01-15 14:30:25.123",
  "inverters": [
    {
      "inverter_id": "inv_001",
      "yc_data": [
        { "ycnum": 1, "value": 300.0, "name": "电压", "unit": "V", "quality": 1 }
      ]
    }
  ]
}
```

---

## 快速启动

### 后端

```bash
cd server
npm install
npm run dev        # 开发模式（端口 3000）
```

### 前端

```bash
cd web
npm install
npm run dev        # 开发模式（端口 5173，代理 → 3000）
```

### 环境变量

| 变量              | 默认值                  | 说明                |
|------------------|------------------------|-------------------|
| `PORT`           | `3000`                 | 后端服务端口         |
| `MQTT_BROKER`    | `mqtt://localhost:1883` | MQTT Broker 地址    |
| `MQTT_DEVICE_ID` | `001`                  | 采集单元设备 ID      |
