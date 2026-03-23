/**
 * MQTT 客户端 — 前端直连 Broker（WebSocket）
 * 用于接收硬件设备上送的遥测/遥信变化数据
 */
import mqtt from 'mqtt'
import { ref, onUnmounted } from 'vue'

const BROKER_WS = 'ws://localhost:8083/mqtt'
const DEVICE_ID = '001'

let client = null
const ycUpdates = ref([])
const yxUpdates = ref([])
const connected = ref(false)

export function useMqtt() {
  function connect() {
    if (client && client.connected) return

    client = mqtt.connect(BROKER_WS, {
      clientId: `collector_web_${Date.now()}`,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    })

    client.on('connect', () => {
      connected.value = true
      const ycTopic = `device/${DEVICE_ID}/ycchange`
      const yxTopic = `device/${DEVICE_ID}/yxchange`
      client.subscribe([ycTopic, yxTopic])
      console.log('[MQTT] 前端已连接，订阅:', ycTopic, yxTopic)
    })

    client.on('message', (topic, payload) => {
      try {
        const data = JSON.parse(payload.toString())
        if (topic.endsWith('/ycchange')) {
          ycUpdates.value = data
        } else if (topic.endsWith('/yxchange')) {
          yxUpdates.value = data
        }
      } catch (e) {
        console.error('[MQTT] 消息解析失败', e)
      }
    })

    client.on('close', () => {
      connected.value = false
    })

    client.on('error', (err) => {
      console.error('[MQTT] 错误:', err.message)
    })
  }

  function disconnect() {
    if (client) {
      client.end()
      client = null
      connected.value = false
    }
  }

  onUnmounted(() => {
    disconnect()
  })

  return { connect, disconnect, connected, ycUpdates, yxUpdates }
}
