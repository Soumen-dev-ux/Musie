import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAdGuardStore } from '../store/adguardStore';
import { colors } from '../theme/colors';

export function AdGuardCard() {
  const config = useAdGuardStore((s) => s.config);
  const stats = useAdGuardStore((s) => s.stats);
  const rules = useAdGuardStore((s) => s.rules);
  const syncError = useAdGuardStore((s) => s.syncError);
  const updateConfig = useAdGuardStore((s) => s.updateConfig);
  const addRule = useAdGuardStore((s) => s.addRule);
  const toggleRule = useAdGuardStore((s) => s.toggleRule);
  const deleteRule = useAdGuardStore((s) => s.deleteRule);
  const resetStats = useAdGuardStore((s) => s.resetStats);

  const [newPattern, setNewPattern] = useState('');
  const [ruleType, setRuleType] = useState<'block' | 'allow'>('block');
  const [showRules, setShowRules] = useState(false);

  const handleAddRule = async () => {
    const trimmed = newPattern.trim();
    if (!trimmed) return;
    try {
      await addRule(trimmed, ruleType, 'Added from mobile app');
      setNewPattern('');
    } catch (err) {
      Alert.alert('Invalid Rule', err instanceof Error ? err.message : 'Could not add rule');
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Ionicons
            name="shield-checkmark"
            size={22}
            color={config.enabled ? colors.shieldActive : colors.textMuted}
          />
          <View>
            <Text style={styles.cardTitle}>Musie AdGuard Shield</Text>
            <Text style={styles.cardSubtitle}>
              {config.enabled
                ? 'Active · Blocking third-party ad domains & sponsors'
                : 'Paused · Tap switch to enable protection'}
            </Text>
          </View>
        </View>
        <Switch
          value={config.enabled}
          onValueChange={(v) => updateConfig({ enabled: v })}
          trackColor={{ false: '#3E3E3E', true: colors.shieldActive }}
          thumbColor="#FFFFFF"
        />
      </View>

      {syncError && (
        <Text style={styles.syncWarn}>
          Offline/local mode ({syncError}). Rules will sync when backend is reachable.
        </Text>
      )}

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats.totalBlocked}</Text>
          <Text style={styles.statLabel}>Ads Blocked</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats.sponsorSegmentsSkipped}</Text>
          <Text style={styles.statLabel}>Sponsors Skipped</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats.trackingParamsStripped}</Text>
          <Text style={styles.statLabel}>Trackers Stripped</Text>
        </View>
      </View>

      {/* Feature Toggles */}
      <View style={styles.toggleRow}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={styles.toggleTitle}>Ad & Tracker Domain Filter</Text>
          <Text style={styles.toggleSub}>
            Blocks DoubleClick, Triton, AdsWizz, Spotify/YouTube ad hosts
          </Text>
        </View>
        <Switch
          value={config.blockAdDomains}
          disabled={!config.enabled}
          onValueChange={(v) => updateConfig({ blockAdDomains: v })}
          trackColor={{ false: '#3E3E3E', true: colors.primary }}
          thumbColor="#FFFFFF"
        />
      </View>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={styles.toggleTitle}>Auto-Skip In-Track Sponsor Ads</Text>
          <Text style={styles.toggleSub}>
            Uses SponsorBlock to skip non-music intros, promos & ad reads
          </Text>
        </View>
        <Switch
          value={config.sponsorBlockEnabled}
          disabled={!config.enabled}
          onValueChange={(v) => updateConfig({ sponsorBlockEnabled: v })}
          trackColor={{ false: '#3E3E3E', true: colors.primary }}
          thumbColor="#FFFFFF"
        />
      </View>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={styles.toggleTitle}>Block Third-Party Audio Ad Streams</Text>
          <Text style={styles.toggleSub}>
            Rejects VAST/VMAP/DAI/preroll ad-insertion stream URLs
          </Text>
        </View>
        <Switch
          value={config.blockThirdPartyAudioAds}
          disabled={!config.enabled}
          onValueChange={(v) => updateConfig({ blockThirdPartyAudioAds: v })}
          trackColor={{ false: '#3E3E3E', true: colors.primary }}
          thumbColor="#FFFFFF"
        />
      </View>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={styles.toggleTitle}>Strip Tracking Query Params</Text>
          <Text style={styles.toggleSub}>Removes utm_*, si, fbclid, gclid from external URLs</Text>
        </View>
        <Switch
          value={config.stripTrackingParams}
          disabled={!config.enabled}
          onValueChange={(v) => updateConfig({ stripTrackingParams: v })}
          trackColor={{ false: '#3E3E3E', true: colors.primary }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* Custom AdGuard Rules Box */}
      <View style={styles.rulesHeader}>
        <Text style={styles.sectionHeading}>Custom Filter Rules ({rules.length})</Text>
        <TouchableOpacity onPress={() => setShowRules((v) => !v)}>
          <Text style={styles.linkText}>{showRules ? 'Hide Rules' : 'Manage Rules'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.ruleInputRow}>
        <TextInput
          style={styles.ruleInput}
          value={newPattern}
          onChangeText={setNewPattern}
          placeholder="||ads.example.com^ or domain.com"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.modeChip, ruleType === 'allow' && styles.modeChipAllow]}
          onPress={() => setRuleType((t) => (t === 'block' ? 'allow' : 'block'))}
        >
          <Text style={styles.modeChipText}>{ruleType.toUpperCase()}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addRuleBtn} onPress={handleAddRule}>
          <Ionicons name="add" size={20} color={colors.background} />
        </TouchableOpacity>
      </View>

      {showRules && (
        <View style={styles.rulesList}>
          {rules.slice(0, 20).map((rule) => (
            <View key={rule.id} style={styles.ruleItem}>
              <TouchableOpacity
                onPress={() => toggleRule(rule.id, !rule.enabled)}
                style={{ flex: 1 }}
              >
                <Text
                  style={[
                    styles.rulePattern,
                    !rule.enabled && { opacity: 0.45, textDecorationLine: 'line-through' },
                  ]}
                  numberOfLines={1}
                >
                  [{rule.type.toUpperCase()}] {rule.pattern}
                </Text>
                {rule.comment ? (
                  <Text style={styles.ruleComment} numberOfLines={1}>
                    {rule.comment}
                  </Text>
                ) : null}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteRule(rule.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {stats.recentBlocked.length > 0 && (
        <View style={styles.recentBox}>
          <View style={styles.rulesHeader}>
            <Text style={styles.sectionHeading}>Recent Blocked Sources</Text>
            <TouchableOpacity onPress={resetStats}>
              <Text style={styles.linkText}>Reset Stats</Text>
            </TouchableOpacity>
          </View>
          {stats.recentBlocked.slice(0, 5).map((ev) => (
            <Text key={ev.id} style={styles.blockedItem} numberOfLines={1}>
              Blocked {ev.hostname} ({ev.matchedRule})
            </Text>
          ))}
        </View>
      )}
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
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  syncWarn: {
    color: colors.warning,
    fontSize: 11.5,
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    color: colors.shieldActive,
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  toggleTitle: {
    color: colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '600',
  },
  toggleSub: {
    color: colors.textMuted,
    fontSize: 11.5,
    marginTop: 2,
  },
  rulesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 8,
  },
  sectionHeading: {
    color: colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
  },
  linkText: {
    color: colors.primary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  ruleInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ruleInput: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeChip: {
    backgroundColor: 'rgba(226,33,52,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modeChipAllow: {
    backgroundColor: 'rgba(29,185,84,0.22)',
  },
  modeChipText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
  },
  addRuleBtn: {
    backgroundColor: colors.shieldActive,
    padding: 9,
    borderRadius: 8,
  },
  rulesList: {
    marginTop: 10,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    padding: 8,
    gap: 6,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rulePattern: {
    color: colors.textPrimary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  ruleComment: {
    color: colors.textMuted,
    fontSize: 11,
  },
  recentBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  blockedItem: {
    color: colors.textSecondary,
    fontSize: 11.5,
    marginBottom: 4,
  },
});
