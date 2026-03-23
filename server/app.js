const express = require('express');
const cors = require('cors');
const path = require('path');

const configRoutes = require('./routes/config');
const networkRoutes = require('./routes/network');
const loraRoutes = require('./routes/lora');
const serialRoutes = require('./routes/serial');
const inverterRoutes = require('./routes/inverter');
const realtimeRoutes = require('./routes/realtime');
const pointTableRoutes = require('./routes/pointTable');
const table104Routes = require('./routes/table104');
const systemRoutes = require('./routes/system');
const { initMqtt } = require('./services/mqttService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api', configRoutes);
app.use('/api', networkRoutes);
app.use('/api', loraRoutes);
app.use('/api', serialRoutes);
app.use('/api', inverterRoutes);
app.use('/api', realtimeRoutes);
app.use('/api', pointTableRoutes);
app.use('/api', table104Routes);
app.use('/api', systemRoutes);

app.use(express.static(path.join(__dirname, '../web/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../web/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`[Server] 采集控制单元配置工具后端已启动 http://localhost:${PORT}`);
  initMqtt();
});
