import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

interface PlaylistCardProps {
  title: string;
  subtitle: string;
  imageUrl?: string;
  onPress: () => void;
  width?: number;
}

export function PlaylistCard({
  title,
  subtitle,
  imageUrl,
  onPress,
  width = 152,
}: PlaylistCardProps) {
  return (
    <TouchableOpacity style={[styles.card, { width }]} onPress={onPress} activeOpacity={0.8}>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={[styles.cover, { width, height: width }]}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.cover, styles.placeholder, { width, height: width }]}>
          <Ionicons name="musical-notes" size={40} color={colors.textMuted} />
        </View>
      )}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {subtitle}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginRight: 14,
  },
  cover: {
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
});
