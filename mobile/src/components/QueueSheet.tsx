import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePlayerStore } from '../store/playerStore';
import { colors } from '../theme/colors';

interface QueueSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function QueueSheet({ visible, onClose }: QueueSheetProps) {
  const queue = usePlayerStore((s) => s.queue);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const playQueueAt = usePlayerStore((s) => s.playQueueAt);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);
  const clearQueue = usePlayerStore((s) => s.clearQueue);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Up Next ({queue.length})</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <TouchableOpacity onPress={clearQueue}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <FlatList
            data={queue}
            keyExtractor={(item, idx) => `${item.youtubeId}-${idx}`}
            renderItem={({ item, index }) => {
              const active = index === currentIndex;
              return (
                <TouchableOpacity
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => {
                    playQueueAt(index);
                    onClose();
                  }}
                >
                  <Image source={{ uri: item.artworkUrl }} style={styles.thumb} contentFit="cover" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.title, active && styles.titleActive]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.artist} numberOfLines={1}>
                      {item.artist}
                    </Text>
                  </View>
                  {!active && (
                    <TouchableOpacity onPress={() => removeFromQueue(index)} hitSlop={8}>
                      <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>Queue is empty. Play any song to start.</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '68%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  clearText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  rowActive: {
    backgroundColor: 'rgba(29, 185, 84, 0.14)',
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  titleActive: {
    color: colors.primary,
  },
  artist: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 40,
  },
});
