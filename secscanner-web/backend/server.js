/**
 * Servidor principal Express + Socket.IO para secscanner-web.
 * Expone API REST y emite eventos en tiempo real con el progreso de los escaneos.
 */
require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const { createApiRouter } = require('./src/api');
const { createJobQueue } = require('./src/jobs');

const PORT = parseInt(process.env.PORT || '3001', 10);
const MAX_PARALLEL_JOBS = parseInt(process.env.MAX_PARALLEL_JOBS || '2', 10);
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: false,
  },
});

const jobQueue = createJobQueue({
  maxParallelJobs: MAX_PARALLEL_JOBS,
  dataDir: path.resolve(__dirname, 'data'),
});

jobQueue.on('progress', ({ jobId, payload }) => {
  io.to(jobId).emit('scan:progress', payload);
});

jobQueue.on('done', ({ jobId, payload }) => {
  io.to(jobId).emit('scan:done', payload);
});

jobQueue.on('error', ({ jobId, error }) => {
  io.to(jobId).emit('scan:error', {
    scan_id: jobId,
    error: error.message || 'Error desconocido durante el escaneo.',
  });
});

app.set('trust proxy', 1);

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  }),
);

app.use(express.json({ limit: '1mb' }));

const scanLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '5', 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Demasiadas solicitudes de escaneo. Intenta de nuevo más tarde.',
  },
});

app.use('/api/scan', scanLimiter);

const apiRouter = createApiRouter({
  jobQueue,
});

app.use('/api', apiRouter);

io.on('connection', (socket) => {
  const { scan_id: handshakeScanId } = socket.handshake.query || {};
  if (handshakeScanId && jobQueue.hasJob(handshakeScanId)) {
    socket.join(handshakeScanId);
    const job = jobQueue.getJob(handshakeScanId);
    socket.emit('scan:status', jobQueue.serializeJob(job));
  }

  socket.on('subscribe', (scanId) => {
    if (!scanId || typeof scanId !== 'string') {
      socket.emit('scan:error', {
        scan_id: scanId,
        error: 'scan_id inválido.',
      });
      return;
    }
    if (!jobQueue.hasJob(scanId)) {
      socket.emit('scan:error', {
        scan_id: scanId,
        error: 'Escaneo no encontrado.',
      });
      return;
    }
    socket.join(scanId);
    const job = jobQueue.getJob(scanId);
    socket.emit('scan:status', jobQueue.serializeJob(job));
  });
});

httpServer.listen(PORT, () => {
  console.log(`secscanner-web backend escuchando en http://localhost:${PORT}`);
});
