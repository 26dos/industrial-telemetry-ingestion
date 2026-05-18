/**
 * MQTT client — frontend connects directly to the broker (WebSocket)
 * Receives measurement/status changes from field devices
 */
import mqtt from 'mqtt'
import { ref, onUnmounted } from 'vue'

const BROKER_WS = 'ws://192.168.1.100:9001/mqtt'
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
      const ycTopic = `device/${DEVICE_ID}/yc/change`
      const yxTopic = `device/${DEVICE_ID}/yx/change`
      client.subscribe([ycTopic, yxTopic])
      console.log('[MQTT] frontend connected; subscribed to:', ycTopic, yxTopic)
    })

    client.on('message', (topic, payload) => {
      try {
        const data = JSON.parse(payload.toString())
        if (topic.endsWith('/yc/change')) {
          ycUpdates.value = data
        } else if (topic.endsWith('/yx/change')) {
          yxUpdates.value = data
        }
      } catch (e) {
        console.error('[MQTT] Message parse failed', e)
      }
    })

    client.on('close', () => {
      connected.value = false
    })

    client.on('error', (err) => {
      console.error('[MQTT] Error:', err.message)
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
