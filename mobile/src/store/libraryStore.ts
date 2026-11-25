import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { apiClient } from '../services/apiClient';
import { Playlist, Track } from '../types';

const LIBRARY_CACHE_KEY = 'musie_library_cache_v1';

interface LibraryState {
  likedTracks: Track[];
  playlists: Playlist[];
  recentlyPlayed: Track[];
  loading: boolean;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  isLiked: (youtubeId: string) => boolean;
  toggleLike: (track: Track) => Promise<void>;
  recordRecent: (track: Track) => Promise<void>;
  createPlaylist: (name: string, description?: string) => Promise<Playlist>;
  addTrackToPlaylist: (playlistId: string, track: Track) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, youtubeId: string) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  importSpotifyPlaylist: (playlistUrl: string) => Promise<Playlist>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  likedTracks: [],
  playlists: [],
  recentlyPlayed: [],
  loading: false,

  init: async () => {
    try {
      const cached = await AsyncStorage.getItem(LIBRARY_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as {
          likedTracks?: Track[];
          playlists?: Playlist[];
          recentlyPlayed?: Track[];
        };
        set({
          likedTracks: parsed.likedTracks || [],
          playlists: parsed.playlists || [],
          recentlyPlayed: parsed.recentlyPlayed || [],
        });
      }
    } catch {
      // ignore
    }
    await get().refresh();
  },

  refresh: async () => {
    set({ loading: true });
    try {
      const data = await apiClient.getLibrary();
      set({
        likedTracks: data.likedTracks,
        playlists: data.playlists,
        recentlyPlayed: data.recentlyPlayed,
        loading: false,
      });
      await AsyncStorage.setItem(LIBRARY_CACHE_KEY, JSON.stringify(data));
    } catch {
      set({ loading: false });
    }
  },

  isLiked: (youtubeId) => {
    return get().likedTracks.some((t) => t.youtubeId === youtubeId);
  },

  toggleLike: async (track) => {
    const exists = get().isLiked(track.youtubeId);
    const optimistic = exists
      ? get().likedTracks.filter((t) => t.youtubeId !== track.youtubeId)
      : [{ ...track, addedAt: new Date().toISOString() }, ...get().likedTracks];
    set({ likedTracks: optimistic });

    try {
      const res = await apiClient.toggleLike(track);
      set({ likedTracks: res.likedTracks });
    } catch {
      // Keep optimistic state locally
    }
  },

  recordRecent: async (track) => {
    const optimistic = [
      track,
      ...get().recentlyPlayed.filter((t) => t.youtubeId !== track.youtubeId),
    ].slice(0, 30);
    set({ recentlyPlayed: optimistic });
    try {
      const res = await apiClient.recordRecent(track);
      set({ recentlyPlayed: res.recentlyPlayed });
    } catch {
      // ignore
    }
  },

  createPlaylist: async (name, description = '') => {
    const { playlist } = await apiClient.createPlaylist(name, description);
    set({ playlists: [playlist, ...get().playlists] });
    return playlist;
  },

  addTrackToPlaylist: async (playlistId, track) => {
    const { playlist } = await apiClient.addTrackToPlaylist(playlistId, track);
    set({
      playlists: get().playlists.map((p) => (p.id === playlistId ? playlist : p)),
    });
  },

  removeTrackFromPlaylist: async (playlistId, youtubeId) => {
    const { playlist } = await apiClient.removeTrackFromPlaylist(playlistId, youtubeId);
    set({
      playlists: get().playlists.map((p) => (p.id === playlistId ? playlist : p)),
    });
  },

  deletePlaylist: async (playlistId) => {
    await apiClient.deletePlaylist(playlistId);
    set({ playlists: get().playlists.filter((p) => p.id !== playlistId) });
  },

  importSpotifyPlaylist: async (playlistUrl) => {
    const { playlist } = await apiClient.importSpotifyPlaylist(playlistUrl);
    set({ playlists: [playlist, ...get().playlists] });
    return playlist;
  },
}));
