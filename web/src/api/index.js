import axios from 'axios'
import { ElMessage } from 'element-plus'

const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.response.use(
  (response) => {
    const { data } = response
    if (data.code && data.code !== 200) {
      ElMessage.error(data.msg || 'request failed')
      return Promise.reject(new Error(data.msg))
    }
    return data
  },
  (error) => {
    ElMessage.error(error.message || 'network error')
    return Promise.reject(error)
  }
)

function post(url, data = {}) {
  return http.post(url, data)
}

function upload(url, file) {
  const formData = new FormData()
  formData.append('file', file)
  return http.post(url, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

// ===== System Configuration =====
export const getConfigInfo = () => post('/getConfigInfo')
export const setConfigInfo = (data) => post('/setConfigInfo', data)

// ===== Network Configuration =====
export const getNetwork = () => post('/getNetwork')
export const setNetwork = (data) => post('/setNetwork', data)
export const restartNetwork = () => post('/restartNetwork')

// ===== Wireless Configuration =====
export const getLoRaInfo = () => post('/getLoRaInfo')
export const setLoRaInfo = (data) => post('/setLoRaInfo', data)

// ===== Serial Port Management =====
export const getSerialInfo = () => post('/getSerialInfo')
export const setSerialInfo = (data) => post('/setSerialInfo', data)
export const getSerialMax = () => post('/getSerialMax')

// ===== Inverter Management =====
export const getInverterInfo = () => post('/getInverterInfo')
export const setInverterInfo = (data) => post('/setInverterInfo', data)
export const getInverterMax = () => post('/getInverterMax')

// ===== Realtime Data =====
export const getAllDataYC = () => post('/getAllData/YC')
export const getAllDataYX = () => post('/getAllData/YX')
export const getControlListYT = () => post('/getControlList/YT')
export const controlYT = (data) => post('/control/YT', data)

// ===== Device Point Table =====
export const getInverterTableList = () => post('/getInverterTableList')
export const getInverterTableInfo = (name) => post('/getInverterTableInfo', { name })
export const uploadInverterTableFile = (file) => upload('/uploadInverterTableFile', file)
export const deleteInverterTableFile = (name) => post('/deleteInverterTableFile', { name })

// ===== IEC 104 Tables =====
export const get104List = () => post('/get104List')
export const get104Info = (name) => post('/get104Info', { name })
export const set104File = (name) => post('/set104File', { name })
export const upload104File = (file) => upload('/upload104File', file)
export const delete104File = (name) => post('/delete104File', { name })

// ===== System Information =====
export const getVersion = () => post('/getVersion')
export const getSystemInfo = () => post('/getSystemInfo')
export const restartService = () => post('/restart')
