import { api } from '@/hooks/useApi';
import { useTheme } from '@/hooks/useTheme';
import MarkdownView from '@/components/MarkdownView';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ColorScheme } from '@/constants/Colors';

interface ReportResponse {
  report: string;
  period_label: string;
  cached: boolean;
}

export default function ReportScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { period } = useLocalSearchParams<{ period?: string }>();
  const p = period === 'month' ? 'month' : 'week';

  const { data, isLoading, isError, refetch, isFetching } = useQuery<ReportResponse>({
    queryKey: ['report', p],
    queryFn: async () => {
      const res = await api.get(`/api/report?period=${p}`);
      return res.data;
    },
    staleTime: 1000 * 60 * 30,
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{data?.period_label ?? (p === 'week' ? '本周报告' : '本月报告')}</Text>
        <TouchableOpacity
          onPress={() => refetch()}
          disabled={isFetching}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="refresh-outline" size={20} color={isFetching ? colors.primaryMuted : colors.primary} />
        </TouchableOpacity>
      </View>

      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>AI 正在生成报告，请稍候…</Text>
        </View>
      )}

      {isError && !isLoading && (
        <View style={styles.center}>
          <Ionicons name="warning-outline" size={36} color={colors.danger} />
          <Text style={styles.errorText}>报告生成失败，请检查网络</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>重试</Text>
          </TouchableOpacity>
        </View>
      )}

      {data && !isLoading && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {!data.cached && (
            <View style={styles.freshBadge}>
              <Ionicons name="sparkles-outline" size={12} color={colors.primary} />
              <Text style={styles.freshText}>刚刚生成</Text>
            </View>
          )}
          <MarkdownView content={data.report} colors={colors} />
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(c: ColorScheme) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 0.5,
      borderBottomColor: c.border,
    },
    title: { fontSize: 16, fontWeight: '600', color: c.text, flex: 1, textAlign: 'center', marginHorizontal: 8 },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingTop: 16 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
    loadingText: { fontSize: 14, color: c.textSecondary, textAlign: 'center', marginTop: 8 },
    errorText: { fontSize: 15, color: c.danger, textAlign: 'center' },
    retryBtn: { backgroundColor: c.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
    retryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    freshBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-end',
      backgroundColor: c.primaryLight,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginBottom: 16,
    },
    freshText: { fontSize: 12, color: c.primary },
  });
}
