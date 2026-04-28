import { api, Stats } from '@/hooks/useApi';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const THEMES: { key: string; label: string; color: string }[] = [
  { key: '创作与灵感', label: '创作与灵感', color: '#534AB7' },
  { key: '生活观察',   label: '生活观察',   color: '#085041' },
  { key: '技术思考',   label: '技术思考',   color: '#3C3489' },
  { key: '阅读笔记',   label: '阅读笔记',   color: '#633806' },
];

export default function InsightsScreen() {
  const { data: stats, isLoading, isError } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await api.get('/api/stats');
      return res.data;
    },
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>洞察</Text>

        {isLoading && <ActivityIndicator color="#534AB7" style={{ marginTop: 40 }} />}

        {isError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>无法连接服务器，请检查 IP 配置</Text>
          </View>
        )}

        {stats && (
          <>
            {/* 统计卡 */}
            <View style={styles.statRow}>
              <StatCard label="随想总数" value={String(stats.total_thoughts)} />
              <StatCard label="文集数量" value={String(stats.total_collections)} />
              <StatCard label="连续天数" value={`${stats.streak_days}天`} />
            </View>

            {/* 主题分布 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>主题分布</Text>
              {THEMES.map(({ key, label, color }) => {
                const pct = stats.theme_distribution?.[key] ?? 0;
                return (
                  <View key={key} style={styles.themeRow}>
                    <Text style={styles.themeLabel}>{label}</Text>
                    <View style={styles.barBg}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${pct}%`, backgroundColor: color },
                        ]}
                      />
                    </View>
                    <Text style={styles.themePercent}>{pct}%</Text>
                  </View>
                );
              })}
            </View>

            {/* AI 洞察 */}
            <View style={styles.insightCard}>
              <Text style={styles.insightTitle}>✦ AI 本周洞察</Text>
              <Text style={styles.insightContent}>{stats.insight}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  scroll: { flex: 1, paddingHorizontal: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', paddingVertical: 12 },
  statRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#E8E6E0',
  },
  statValue: { fontSize: 22, fontWeight: '700', color: '#534AB7', marginBottom: 4 },
  statLabel: { fontSize: 11, color: '#888', textAlign: 'center' },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 0.5,
    borderColor: '#E8E6E0',
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', marginBottom: 14 },
  themeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  themeLabel: { width: 68, fontSize: 12, color: '#444' },
  barBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#F0EFF8',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: 4 },
  themePercent: { width: 36, fontSize: 12, color: '#888', textAlign: 'right' },
  insightCard: {
    backgroundColor: '#EEEDFE',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
  },
  insightTitle: { fontSize: 14, fontWeight: '600', color: '#3C3489', marginBottom: 10 },
  insightContent: { fontSize: 14, color: '#534AB7', lineHeight: 22 },
  errorBox: { margin: 16, padding: 16, backgroundColor: '#FFF0F0', borderRadius: 12 },
  errorText: { color: '#C62828', fontSize: 14 },
});
