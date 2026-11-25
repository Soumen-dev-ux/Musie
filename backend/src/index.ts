import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import adguardRoutes from './routes/adguard.js';
import libraryRoutes from './routes/library.js';
import spotifyRoutes from './routes/spotify.js';
import streamRoutes from './routes/stream.js';
import youtubeRoutes from './routes/youtube.js';

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'musie-backend',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/youtube', youtubeRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/spotify', spotifyRoutes);
app.use('/api/adguard', adguardRoutes);
app.use('/api/library', libraryRoutes);

app.listen(env.port, env.host, () => {
  console.log(`Musie backend listening on http://${env.host}:${env.port}`);
});
