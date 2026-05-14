import { api, EmotionData, logout, Stats, useAuthStore } from '@/hooks/useApi';
import { useTheme } from '@/hooks/useTheme';
import { ColorScheme } from '@/constants/Colors';
import WordCloudView from '@/components/WordCloudView';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const EMOTION_COLORS: Record<string, string> = {
  开心: '#4CAF50',
  兴奋: '#FF9800',
  平静: '#2196F3',
  思考: '#9C27B0',
  焦虑: '#FF5722',
  低落: '#78909C',
};

const EMOTION_EMOJIS: Record<string, string> = {
  开心: '😊', 兴奋: '⚡', 平静: '🌊', 思考: '💭', 焦虑: '😰', 低落: '🌧️',
};

const THEMES: { key: string; label: string; color: string }[] = [
  { key: '创作与灵感', label: '创作与灵感', color: '#534AB7' },
  { key: '生活观察',   label: '生活观察',   color: '#085041' },
  { key: '技术思考',   label: '技术思考',   color: '#3C3489' },
  { key: '阅读笔记',   label: '阅读笔记',   color: '#633806' },
];

export default function InsightsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { username } = useAuthStore();
  const [insightOverride, setInsightOverride] = useState<string | null>(null);
  const [refreshingInsight, setRefreshingInsight] = useState(false);
  const [wordcloudVisible, setWordcloudVisible] = useState(false);

  const { data: stats, isLoading, isError } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await api.get('/api/stats');
      return res.data;
    },
  });

  const { data: emotionData } = useQuery<EmotionData>({
    queryKey: ['emotions'],
    queryFn: async () => {
      const res = await api.get('/api/emotions/timeline?days=30');
      return res.data;
    },
  });

  const { data: heatmapData } = useQuery<{ data: Record<string, number> }>({
    queryKey: ['heatmap'],
    queryFn: async () => {
      const res = await api.get('/api/stats/heatmap');
      return res.data;
    },
  });

  const { data: wordcloudData } = useQuery<{ words: { text: string; value: number }[] }>({
    queryKey: ['wordcloud'],
    queryFn: async () => {
      const res = await api.get('/api/stats/wordcloud');
      return res.data;
    },
    enabled: wordcloudVisible,
    staleTime: 1000 * 60 * 30,
  });

  async function handleRefreshInsight() {
    setRefreshingInsight(true);
    try {
      const res = await api.post('/api/insights/refresh');
      setInsightOverride(res.data.insight);
    } catch (e: any) {
      Alert.alert('提示', e?.response?.data?.detail ?? '生成失败，请稍后重试');
    } finally {
      setRefreshingInsight(false);
    }
  }

  function handleLogout() {
    Alert.alert('退出登录', '确认退出当前账号？', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>洞察</Text>
          <View style={styles.titleActions}>
            <TouchableOpacity style={styles.chatBtn} onPress={() => router.push('/graph')} activeOpacity={0.8}>
              <Ionicons name="git-network-outline" size={15} color={colors.primary} />
              <Text style={styles.chatBtnText}>导图</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chatBtn} onPress={() => router.push('/chat')} activeOpacity={0.8}>
              <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.primary} />
              <Text style={styles.chatBtnText}>对话</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reportBtn} onPress={() => router.push('/report?period=week')} activeOpacity={0.8}>
              <Ionicons name="calendar-outline" size={14} color={colors.primary} />
              <Text style={styles.chatBtnText}>周报</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reportBtn} onPress={() => router.push('/report?period=month')} activeOpacity={0.8}>
              <Ionicons name="bar-chart-outline" size={14} color={colors.primary} />
              <Text style={styles.chatBtnText}>月报</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.userBtn} onPress={handleLogout} activeOpacity={0.7}>
              <Ionicons name="person-circle-outline" size={18} color={colors.primary} />
              <Text style={styles.userText}>{username}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}

        {isError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>无法连接服务器，请检查 IP 配置</Text>
          </View>
        )}

        {stats && (
          <>
            <View style={styles.statRow}>
              <StatCard label="随想总数" value={String(stats.total_thoughts)} styles={styles} />
              <StatCard label="文集数量" value={String(stats.total_collections)} styles={styles} />
              <StatCard label="连续天数" value={`${stats.streak_days}天`} styles={styles} />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>主题分布</Text>
              {THEMES.map(({ key, label, color }) => {
                const pct = stats.theme_distribution?.[key] ?? 0;
                return (
                  <View key={key} style={styles.themeRow}>
                    <Text style={styles.themeLabel}>{label}</Text>
                    <View style={styles.barBg}>
                      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
                    </View>
                    <Text style={styles.themePercent}>{pct}%</Text>
                  </View>
                );
              })}
            </View>

            {heatmapData && <HeatmapSection data={heatmapData.data} colors={colors} styles={styles} />}

            {/* 词云 */}
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>词云</Text>
                <TouchableOpacity onPress={() => setWordcloudVisible((v) => !v)} activeOpacity={0.7}>
                  <Text style={styles.expandBtn}>{wordcloudVisible ? '收起' : '展开'}</Text>
                </TouchableOpacity>
              </View>
              {wordcloudVisible && (
                wordcloudData?.words?.length
                  ? <WordCloudView words={wordcloudData.words} colors={colors} height={220} />
                  : <View style={styles.cloudEmpty}><Text style={styles.cloudEmptyText}>记录更多随想后查看</Text></View>
              )}
            </View>

            {emotionData && (emotionData.timeline.length > 0 || Object.keys(emotionData.distribution).length > 0) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>情绪追踪</Text>

                {emotionData.timeline.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                    <View style={styles.chartArea}>
                      {emotionData.timeline.map((item) => {
                        const intensity = Math.abs(item.avg_score);
                        const barH = Math.max(6, intensity * 60);
                        const color = EMOTION_COLORS[item.dominant] ?? '#aaa';
                        return (
                          <View key={item.date} style={styles.barCol}>
                            <View style={styles.barTrack}>
                              <View style={[styles.chartBarFill, { height: barH, backgroundColor: color }]} />
                            </View>
                            <Text style={styles.barLabel}>{item.date.slice(5)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}

                {Object.keys(emotionData.distribution).length > 0 && (
                  <View style={styles.emotionDistRow}>
                    {Object.entries(emotionData.distribution)
                      .sort((a, b) => b[1] - a[1])
                      .map(([emotion, count]) => (
                        <View key={emotion} style={styles.emotionChip}>
                          <View style={[styles.emotionDot, { backgroundColor: EMOTION_COLORS[emotion] ?? '#aaa' }]} />
                          <Text style={styles.emotionChipText}>
                            {EMOTION_EMOJIS[emotion] ?? ''} {emotion} {count}
                          </Text>
                        </View>
                      ))}
                  </View>
                )}
              </View>
            )}

            <View style={styles.insightCard}>
              <View style={styles.insightHeader}>
                <Text style={styles.insightTitle}>✦ AI 洞察</Text>
                <TouchableOpacity
                  onPress={handleRefreshInsight}
                  disabled={refreshingInsight}
                  style={styles.refreshBtn}
                  activeOpacity={0.7}
                >
                  {refreshingInsight
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Ionicons name="refresh-outline" size={16} color={colors.primary} />
                  }
                  <Text style={styles.refreshText}>
                    {refreshingInsight ? '分析中…' : '重新分析'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.insightContent}>{insightOverride ?? stats.insight}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── 写作热力图 ────────────────────────────────────────────────────────────────

function HeatmapSection({
  data,
  colors,
  styles,
}: {
  data: Record<string, number>;
  colors: ColorScheme;
  styles: ReturnType<typeof makeStyles>;
}) {
  const WEEKS = 16;
  const today = dayjs();
  const startOfGrid = today.subtract(WEEKS * 7 - 1, 'day');

  const weeks: (string | null)[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const week: (string | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const date = startOfGrid.add(w * 7 + d, 'day');
      week.push(date.isAfter(today) ? null : date.format('YYYY-MM-DD'));
    }
    weeks.push(week);
  }

  const maxCount = Math.max(1, ...Object.values(data));

  function cellColor(dateStr: string | null) {
    if (!dateStr) return 'transparent';
    const count = data[dateStr] ?? 0;
    if (count === 0) return colors.heatmapEmpty;
    const intensity = count / maxCount;
    if (intensity < 0.25) return '#C8C4F0';
    if (intensity < 0.5) return '#9F97E0';
    if (intensity < 0.75) return '#6F65CB';
    return '#534AB7';
  }

  const totalDays = Object.values(data).filter((v) => v > 0).length;
  const totalThoughts = Object.values(data).reduce((a, b) => a + b, 0);

  return (
    <View style={styles.hmSection}>
      <View style={styles.hmHeaderRow}>
        <Text style={styles.hmTitle}>写作热力图</Text>
        <Text style={styles.hmSubtitle}>{totalDays} 天 · {totalThoughts} 条</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.hmGrid}>
          {weeks.map((week, wi) => (
            <View key={wi} style={styles.hmWeekCol}>
              {week.map((dateStr, di) => (
                <View key={di} style={[styles.hmCell, { backgroundColor: cellColor(dateStr) }]} />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.hmLegend}>
        <Text style={styles.hmLegendLabel}>少</Text>
        {[colors.heatmapEmpty, '#C8C4F0', '#9F97E0', '#6F65CB', '#534AB7'].map((c, i) => (
          <View key={i} style={[styles.hmCell, { backgroundColor: c }]} />
        ))}
        <Text style={styles.hmLegendLabel}>多</Text>
      </View>
    </View>
  );
}

function StatCard({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function makeStyles(c: ColorScheme) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: c.bg },
    scroll: { flex: 1, paddingHorizontal: 16 },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
    titleActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    chatBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.primaryLight, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
    chatBtnText: { fontSize: 13, color: c.primary },
    reportBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.primaryLight, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
    title: { fontSize: 20, fontWeight: '700', color: c.text },
    userBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.primaryLight, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
    userText: { fontSize: 13, color: c.primary },
    statRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    statCard: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 14,
      alignItems: 'center',
      borderWidth: 0.5,
      borderColor: c.border,
    },
    statValue: { fontSize: 22, fontWeight: '700', color: c.primary, marginBottom: 4 },
    statLabel: { fontSize: 11, color: c.textSecondary, textAlign: 'center' },
    section: {
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 0.5,
      borderColor: c.border,
      marginBottom: 16,
    },
    sectionTitle: { fontSize: 15, fontWeight: '600', color: c.text, marginBottom: 14 },
    sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    expandBtn: { fontSize: 13, color: c.primary },
    cloudEmpty: { paddingVertical: 24, alignItems: 'center' },
    cloudEmptyText: { fontSize: 13, color: c.textTertiary },
    themeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    themeLabel: { width: 68, fontSize: 12, color: c.textSecondary },
    barBg: {
      flex: 1,
      height: 8,
      backgroundColor: c.inputBg,
      borderRadius: 4,
      overflow: 'hidden',
    },
    barFill: { height: 8, borderRadius: 4 },
    themePercent: { width: 36, fontSize: 12, color: c.textSecondary, textAlign: 'right' },
    insightCard: {
      backgroundColor: c.primaryLight,
      borderRadius: 12,
      padding: 16,
      marginBottom: 32,
    },
    insightHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    insightTitle: { fontSize: 14, fontWeight: '600', color: c.primaryDark },
    insightContent: { fontSize: 14, color: c.primary, lineHeight: 22 },
    refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    refreshText: { fontSize: 12, color: c.primary },
    chartArea: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 80, paddingBottom: 20 },
    barCol: { alignItems: 'center', width: 28 },
    barTrack: { height: 60, justifyContent: 'flex-end' },
    chartBarFill: { width: 16, borderRadius: 4 },
    barLabel: { fontSize: 9, color: c.textTertiary, marginTop: 4 },
    emotionDistRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    emotionChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.inputBg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
    emotionDot: { width: 8, height: 8, borderRadius: 4 },
    emotionChipText: { fontSize: 12, color: c.textSecondary },
    errorBox: { margin: 16, padding: 16, backgroundColor: c.dangerBg, borderRadius: 12 },
    errorText: { color: c.danger, fontSize: 14 },
    // Heatmap styles
    hmSection: {
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 0.5,
      borderColor: c.border,
      marginBottom: 16,
    },
    hmHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    hmTitle: { fontSize: 15, fontWeight: '600', color: c.text },
    hmSubtitle: { fontSize: 12, color: c.textTertiary },
    hmGrid: { flexDirection: 'row', gap: 3 },
    hmWeekCol: { flexDirection: 'column', gap: 3 },
    hmCell: { width: 12, height: 12, borderRadius: 2 },
    hmLegend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, justifyContent: 'flex-end' },
    hmLegendLabel: { fontSize: 10, color: c.textTertiary },
  });
}
