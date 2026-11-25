import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../services/apiClient';
import { useSettingsStore } from '../store/settingsStore';
import { colors } from '../theme/colors';

export function ApiKeysCard() {
  const keys = useSettingsStore((s) => s.keys);
  const saveKeys = useSettingsStore((s) => s.saveKeys);
  const resetKeys = useSettingsStore((s) => s.resetKeys);
  const exportConfig = useSettingsStore((s) => s.exportConfig);
  const importConfig = useSettingsStore((s) => s.importConfig);

  const [backendUrl, setBackendUrl] = useState(keys.backendUrl);
  const [youtubeApiKey, setYoutubeApiKey] = useState(keys.youtubeApiKey);
  const [spotifyClientId, setSpotifyClientId] = useState(keys.spotifyClientId);
  const [spotifyClientSecret, setSpotifyClientSecret] = useState(keys.spotifyClientSecret);

  const [showSecrets, setShowSecrets] = useState(false);
  const [includeSecretsOnShare, setIncludeSecretsOnShare] = useState(false);
  const [importText, setImportText] = useState('');
  const [showImportBox, setShowImportBox] = useState(false);
  const [testingTarget, setTestingTarget] = useState<'server' | 'youtube' | 'spotify' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setBackendUrl(keys.backendUrl);
    setYoutubeApiKey(keys.youtubeApiKey);
    setSpotifyClientId(keys.spotifyClientId);
    setSpotifyClientSecret(keys.spotifyClientSecret);
  }, [keys]);

  const handleSave = async () => {
    await saveKeys({
      backendUrl,
      youtubeApiKey,
      spotifyClientId,
      spotifyClientSecret,
    });
    setStatusMessage({ ok: true, text: 'Keys saved securely in device Keychain / Keystore.' });
  };

  const handleTestServer = async () => {
    await handleSave();
    setTestingTarget('server');
    try {
      const res = await apiClient.health();
      setStatusMessage({
        ok: res.ok,
        text: res.ok ? 'Connected to Musie backend!' : 'Server responded with an error.',
      });
    } catch (err) {
      setStatusMessage({
        ok: false,
        text: err instanceof Error ? err.message : 'Cannot reach backend server',
      });
    } finally {
      setTestingTarget(null);
    }
  };

  const handleTestYouTube = async () => {
    await handleSave();
    setTestingTarget('youtube');
    try {
      const res = await apiClient.testYouTubeKey(youtubeApiKey);
      setStatusMessage({ ok: res.valid, text: res.message });
    } catch (err) {
      setStatusMessage({
        ok: false,
        text: err instanceof Error ? err.message : 'YouTube key test failed',
      });
    } finally {
      setTestingTarget(null);
    }
  };

  const handleTestSpotify = async () => {
    await handleSave();
    setTestingTarget('spotify');
    try {
      const res = await apiClient.testSpotifyKeys(spotifyClientId, spotifyClientSecret);
      setStatusMessage({ ok: res.valid, text: res.message });
    } catch (err) {
      setStatusMessage({
        ok: false,
        text: err instanceof Error ? err.message : 'Spotify key test failed',
      });
    } finally {
      setTestingTarget(null);
    }
  };

  const handleShareConfig = async () => {
    await handleSave();
    const payload = exportConfig(includeSecretsOnShare);
    try {
      await Share.share({
        title: 'Musie API Config',
        message: payload,
      });
    } catch (err) {
      Alert.alert('Share failed', err instanceof Error ? err.message : 'Unable to share');
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    try {
      await importConfig(importText);
      setImportText('');
      setShowImportBox(false);
      setStatusMessage({ ok: true, text: 'Imported configuration into SecureStore!' });
    } catch (err) {
      setStatusMessage({
        ok: false,
        text: err instanceof Error ? err.message : 'Invalid JSON config',
      });
    }
  };

  const handleReset = () => {
    Alert.alert('Clear API Keys?', 'This removes your saved YouTube and Spotify keys from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await resetKeys();
          setStatusMessage({ ok: true, text: 'Cleared saved keys.' });
        },
      },
    ]);
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Ionicons name="key-outline" size={20} color={colors.primary} />
          <Text style={styles.cardTitle}>Spotify & YouTube API Keys Vault</Text>
        </View>
        <TouchableOpacity onPress={() => setShowSecrets((v) => !v)} hitSlop={8}>
          <Ionicons
            name={showSecrets ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <Text style={styles.helperText}>
        Stored encrypted on-device via Expo SecureStore. Used for personal YouTube search & Spotify playlist import.
      </Text>

      <Text style={styles.label}>Personal Backend URL</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={backendUrl}
          onChangeText={setBackendUrl}
          placeholder="http://192.168.1.50:4000"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity style={styles.testBtn} onPress={handleTestServer}>
          {testingTarget === 'server' ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Text style={styles.testBtnText}>Ping</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>YouTube Data API v3 Key (Optional — improves search)</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={youtubeApiKey}
          onChangeText={setYoutubeApiKey}
          placeholder="AIzaSy..."
          placeholderTextColor={colors.textMuted}
          secureTextEntry={!showSecrets}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity style={styles.testBtn} onPress={handleTestYouTube}>
          {testingTarget === 'youtube' ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Text style={styles.testBtnText}>Test</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Spotify Client ID</Text>
      <TextInput
        style={styles.inputFull}
        value={spotifyClientId}
        onChangeText={setSpotifyClientId}
        placeholder="Paste Spotify App Client ID"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.label}>Spotify Client Secret</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={spotifyClientSecret}
          onChangeText={setSpotifyClientSecret}
          placeholder="Paste Spotify App Client Secret"
          placeholderTextColor={colors.textMuted}
          secureTextEntry={!showSecrets}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity style={styles.testBtn} onPress={handleTestSpotify}>
          {testingTarget === 'spotify' ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Text style={styles.testBtnText}>Test</Text>
          )}
        </TouchableOpacity>
      </View>

      {statusMessage && (
        <View
          style={[
            styles.statusBanner,
            { backgroundColor: statusMessage.ok ? 'rgba(29,185,84,0.16)' : 'rgba(226,33,52,0.16)' },
          ]}
        >
          <Ionicons
            name={statusMessage.ok ? 'checkmark-circle' : 'alert-circle'}
            size={16}
            color={statusMessage.ok ? colors.primary : colors.danger}
          />
          <Text
            style={[
              styles.statusText,
              { color: statusMessage.ok ? colors.primary : colors.danger },
            ]}
          >
            {statusMessage.text}
          </Text>
        </View>
      )}

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Ionicons name="save-outline" size={16} color={colors.background} />
          <Text style={styles.saveBtnText}>Save Keys</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.clearBtn} onPress={handleReset}>
          <Text style={styles.clearBtnText}>Clear</Text>
        </TouchableOpacity>
      </View>

      {/* Share / Sync Box */}
      <View style={styles.shareBox}>
        <Text style={styles.shareTitle}>Share / Sync Keys Across Your Devices</Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Include secret keys in exported JSON</Text>
          <Switch
            value={includeSecretsOnShare}
            onValueChange={setIncludeSecretsOnShare}
            trackColor={{ false: '#3E3E3E', true: colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.shareButtons}>
          <TouchableOpacity style={styles.outlineBtn} onPress={handleShareConfig}>
            <Ionicons name="share-social-outline" size={16} color={colors.textPrimary} />
            <Text style={styles.outlineBtnText}>Share Config</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={() => setShowImportBox((v) => !v)}
          >
            <Ionicons name="download-outline" size={16} color={colors.textPrimary} />
            <Text style={styles.outlineBtnText}>
              {showImportBox ? 'Hide Import' : 'Import JSON'}
            </Text>
          </TouchableOpacity>
        </View>

        {showImportBox && (
          <View style={{ marginTop: 10 }}>
            <TextInput
              style={styles.importInput}
              value={importText}
              onChangeText={setImportText}
              placeholder='Paste exported Musie JSON here...'
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
            />
            <TouchableOpacity style={styles.importConfirmBtn} onPress={handleImport}>
              <Text style={styles.saveBtnText}>Apply Imported Config</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: 12.5,
    marginTop: 6,
    marginBottom: 12,
    lineHeight: 18,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputFull: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  testBtn: {
    backgroundColor: colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 62,
    alignItems: 'center',
  },
  testBtnText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 13,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  statusText: {
    fontSize: 12.5,
    fontWeight: '600',
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 22,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  saveBtnText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 14,
  },
  clearBtn: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 22,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  clearBtnText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 13.5,
  },
  shareBox: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  shareTitle: {
    color: colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
    marginBottom: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  switchLabel: {
    color: colors.textSecondary,
    fontSize: 12.5,
    flex: 1,
    marginRight: 10,
  },
  shareButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  outlineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  outlineBtnText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  importInput: {
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: 8,
    padding: 10,
    minHeight: 86,
    textAlignVertical: 'top',
    fontSize: 12.5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  importConfirmBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
});
