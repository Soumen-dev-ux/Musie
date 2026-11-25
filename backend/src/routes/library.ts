import { Router } from 'express';
import { storageService } from '../services/storageService.js';
import { Playlist, Track } from '../types/index.js';

const router = Router();

router.get('/', (_req, res) => {
  const state = storageService.getState();
  res.json({
    likedTracks: state.likedTracks,
    playlists: state.playlists,
    recentlyPlayed: state.recentlyPlayed,
  });
});

router.post('/like', (req, res) => {
  const track = req.body?.track as Track | undefined;
  if (!track || !track.youtubeId) {
    res.status(400).json({ error: 'Valid track object is required' });
    return;
  }
  const state = storageService.getState();
  const exists = state.likedTracks.some((t) => t.youtubeId === track.youtubeId);
  if (exists) {
    state.likedTracks = state.likedTracks.filter((t) => t.youtubeId !== track.youtubeId);
  } else {
    state.likedTracks.unshift({ ...track, addedAt: new Date().toISOString() });
  }
  storageService.scheduleSave();
  res.json({ liked: !exists, likedTracks: state.likedTracks });
});

router.post('/recent', (req, res) => {
  const track = req.body?.track as Track | undefined;
  if (!track || !track.youtubeId) {
    res.status(400).json({ error: 'Valid track object is required' });
    return;
  }
  const state = storageService.getState();
  state.recentlyPlayed = [
    track,
    ...state.recentlyPlayed.filter((t) => t.youtubeId !== track.youtubeId),
  ].slice(0, 30);
  storageService.scheduleSave();
  res.json({ recentlyPlayed: state.recentlyPlayed });
});

router.post('/playlists', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'Playlist name is required' });
    return;
  }

  const now = new Date().toISOString();
  const playlist: Playlist = {
    id: `pl-${Date.now()}`,
    name,
    description,
    tracks: [],
    source: 'local',
    createdAt: now,
    updatedAt: now,
  };

  const state = storageService.getState();
  state.playlists.unshift(playlist);
  storageService.scheduleSave();
  res.status(201).json({ playlist });
});

router.post('/playlists/:id/tracks', (req, res) => {
  const track = req.body?.track as Track | undefined;
  if (!track || !track.youtubeId) {
    res.status(400).json({ error: 'Valid track object is required' });
    return;
  }

  const state = storageService.getState();
  const playlist = state.playlists.find((p) => p.id === req.params.id);
  if (!playlist) {
    res.status(404).json({ error: 'Playlist not found' });
    return;
  }

  if (!playlist.tracks.some((t) => t.youtubeId === track.youtubeId)) {
    playlist.tracks.push({ ...track, addedAt: new Date().toISOString() });
    if (!playlist.coverUrl && track.artworkUrl) {
      playlist.coverUrl = track.artworkUrl;
    }
    playlist.updatedAt = new Date().toISOString();
    storageService.scheduleSave();
  }

  res.json({ playlist });
});

router.delete('/playlists/:id/tracks/:youtubeId', (req, res) => {
  const state = storageService.getState();
  const playlist = state.playlists.find((p) => p.id === req.params.id);
  if (!playlist) {
    res.status(404).json({ error: 'Playlist not found' });
    return;
  }

  playlist.tracks = playlist.tracks.filter((t) => t.youtubeId !== req.params.youtubeId);
  playlist.updatedAt = new Date().toISOString();
  storageService.scheduleSave();
  res.json({ playlist });
});

router.delete('/playlists/:id', (req, res) => {
  const state = storageService.getState();
  const before = state.playlists.length;
  state.playlists = state.playlists.filter((p) => p.id !== req.params.id);
  if (state.playlists.length === before) {
    res.status(404).json({ error: 'Playlist not found' });
    return;
  }
  storageService.scheduleSave();
  res.json({ deleted: true });
});

export default router;
