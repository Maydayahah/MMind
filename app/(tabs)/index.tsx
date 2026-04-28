import { api, Thought, useStore, VOICE_PLACEHOLDER } from '@/hooks/useApi';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import * as FileSystem from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function StreamScreen() {
  const { thoughts, setThoughts, removeThoughts } = useStore();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { refetch, isRefetching } = useQuery({
    queryKey: ['thoughts'],
    queryFn: async () => {
      const res = await api.get('/api/thoughts');
      setThoughts(res.data);
      return res.data as Thought[];
    },
  });

  const formatDate = (date: string) => {
    const today = dayjs().format('YYYY-MM-DD');
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    if (date === today) return '今天';
    if (date === yesterday) return '昨天';
    return dayjs(date).format('M月D日');
  };

  const grouped = thoughts.reduce((acc, t) => {
    const date = dayjs(t.created_at).format('YYYY-MM-DD');
    if (!acc[date]) acc[date] = [];
    acc[date].push(t);
    return acc;
  }, {} as Record<string, Thought[]>);

  const sections = Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));

  // ── 选择模式 ──────────────────────────────────────────────────────────────

  function enterSelectMode(id: number) {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(thoughts.map((t) => t.id)));
  }

  // ── 批量操作 ──────────────────────────────────────────────────────────────

  async function handleBatchDelete() {
    const ids = Array.from(selectedIds);
    Alert.alert('确认删除', `删除选中的 ${ids.length} 条随想？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete('/api/thoughts', { data: { ids } });
            removeThoughts(ids);
            exitSelectMode();
          } catch {
            Alert.alert('删除失败', '请检查网络连接');
          }
        },
      },
    ]);
  }

  async function handleBatchOrganize() {
    const ids = Array.from(selectedIds);
    try {
      await api.post('/api/organize', { thought_ids: ids });
      exitSelectMode();
      Alert.alert('整理中', 'AI 正在整理选中随想，稍后在文集页查看');
    } catch {
      Alert.alert('失败', '请检查网络连接');
    }
  }

  async function handleBatchExport() {
    const ids = Array.from(selectedIds);
    const selected = thoughts.filter((t) => ids.includes(t.id));
    selected.sort((a, b) => a.created_at.localeCompare(b.created_at));

    const lines = [
      '# 思绪随想导出',
      `> 导出时间：${dayjs().format('YYYY-MM-DD HH:mm')}`,
      `> 共 ${selected.length} 条`,
      '',
    ];

    for (const t of selected) {
      lines.push(`## ${dayjs(t.created_at).format('YYYY-MM-DD HH:mm')}`);
      lines.push('');
      lines.push(t.content);
      if (t.tags) lines.push(`\n**标签**：${t.tags}`);
      if (t.location) {
        try {
          const loc = JSON.parse(t.location);
          lines.push(`**地点**：${loc.name}`);
        } catch {}
      }
      lines.push('\n---\n');
    }

    const md = lines.join('\n');

    if (Platform.OS === 'web') {
      // Web: 触发浏览器下载
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `thoughts_${dayjs().format('YYYYMMDD')}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const path = `${FileSystem.cacheDirectory}thoughts_${dayjs().format('YYYYMMDD')}.md`;
      await FileSystem.writeAsStringAsync(path, md, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(path, { mimeType: 'text/markdown', dialogTitle: '导出随想' });
    }
    exitSelectMode();
  }

  // ── 渲染 ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      {selectMode ? (
        <View style={styles.header}>
          <TouchableOpacity onPress={exitSelectMode}>
            <Text style={styles.cancelBtn}>取消</Text>
          </TouchableOpacity>
          <Text style={styles.selectCount}>已选 {selectedIds.size} 条</Text>
          <TouchableOpacity onPress={selectAll}>
            <Text style={styles.selectAllBtn}>全选</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.header}>
          <Text style={styles.title}>思绪</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/(tabs)/write')}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.addBtnText}>记录</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        style={styles.list}
        data={sections}
        keyExtractor={([date]) => date}
        refreshControl={
          !selectMode ? (
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#534AB7" colors={['#534AB7']} />
          ) : undefined
        }
        renderItem={({ item: [date, items] }) => (
          <View>
            <Text style={styles.dateHeader}>{formatDate(date)}</Text>
            {items.map((thought) => (
              <ThoughtCard
                key={thought.id}
                thought={thought}
                selectMode={selectMode}
                selected={selectedIds.has(thought.id)}
                onLongPress={() => enterSelectMode(thought.id)}
                onPress={() => selectMode && toggleSelect(thought.id)}
              />
            ))}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="leaf-outline" size={40} color="#D0CFC8" />
            <Text style={styles.emptyText}>还没有随想</Text>
            <Text style={styles.emptyHint}>点击右上角「记录」开始记录</Text>
          </View>
        }
      />

      {/* 批量操作栏 */}
      {selectMode && selectedIds.size > 0 && (
        <View style={styles.actionBar}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleBatchOrganize}>
            <Ionicons name="sparkles-outline" size={20} color="#534AB7" />
            <Text style={styles.actionBtnText}>整理</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleBatchExport}>
            <Ionicons name="share-outline" size={20} color="#534AB7" />
            <Text style={styles.actionBtnText}>导出</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDelete]} onPress={handleBatchDelete}>
            <Ionicons name="trash-outline" size={20} color="#E53935" />
            <Text style={[styles.actionBtnText, { color: '#E53935' }]}>删除</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── ThoughtCard ───────────────────────────────────────────────────────────────

function ThoughtCard({
  thought,
  selectMode,
  selected,
  onLongPress,
  onPress,
}: {
  thought: Thought;
  selectMode: boolean;
  selected: boolean;
  onLongPress: () => void;
  onPress: () => void;
}) {
  const tags = thought.tags ? thought.tags.split(',').filter(Boolean) : [];
  let imgs: string[] = [];
  try { if (thought.images) imgs = JSON.parse(thought.images); } catch {}
  let locName = '';
  try { if (thought.location) locName = JSON.parse(thought.location).name; } catch {}

  const isVoice = !!thought.audio;
  const isPending = thought.content === VOICE_PLACEHOLDER;

  function handlePress() {
    if (selectMode) { onPress(); } else { router.push(`/thought/${thought.id}`); }
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.card, selected && styles.cardSelected]}
      onLongPress={onLongPress}
      onPress={handlePress}
      delayLongPress={400}
    >
      <View style={styles.cardRow}>
        {selectMode && (
          <View style={[styles.checkbox, selected && styles.checkboxActive]}>
            {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        )}
        <View style={styles.cardContent}>
          <View style={styles.cardMeta}>
            <Text style={styles.time}>{dayjs(thought.created_at).format('HH:mm')}</Text>
            {isVoice && (
              <View style={styles.voiceBadge}>
                <Ionicons name="mic" size={10} color="#534AB7" />
                <Text style={styles.voiceBadgeText}>语音</Text>
              </View>
            )}
            {locName ? (
              <View style={styles.locBadge}>
                <Ionicons name="location" size={10} color="#534AB7" />
                <Text style={styles.locText} numberOfLines={1}>{locName}</Text>
              </View>
            ) : null}
          </View>

          {/* 语音播放器 */}
          {isVoice && <AudioPlayer uri={thought.audio} />}

          {/* 内容：pending 时显示转录中提示 */}
          {isPending ? (
            <View style={styles.pendingRow}>
              <Ionicons name="hourglass-outline" size={13} color="#aaa" />
              <Text style={styles.pendingText}>转录中，刷新后查看文字…</Text>
            </View>
          ) : (
            <Text style={styles.content} numberOfLines={selectMode ? 2 : undefined}>
              {thought.content}
            </Text>
          )}

          {imgs.length > 0 && (
            <View style={styles.imgRow}>
              {imgs.slice(0, 3).map((uri, i) => (
                <Image key={i} source={{ uri }} style={styles.imgThumb} />
              ))}
              {imgs.length > 3 && (
                <View style={styles.imgMore}>
                  <Text style={styles.imgMoreText}>+{imgs.length - 3}</Text>
                </View>
              )}
            </View>
          )}
          {tags.length > 0 && (
            <View style={styles.tagRow}>
              {tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── 音频播放器 ────────────────────────────────────────────────────────────────

function AudioPlayer({ uri }: { uri: string }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);    // ms
  const [dur, setDur] = useState(0);    // ms

  async function toggle() {
    if (!sound) {
      const { sound: s } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            setPos(status.positionMillis);
            setDur(status.durationMillis ?? 0);
            setPlaying(status.isPlaying);
            if (status.didJustFinish) setPlaying(false);
          }
        }
      );
      setSound(s);
      setPlaying(true);
    } else {
      if (playing) { await sound.pauseAsync(); setPlaying(false); }
      else { await sound.playAsync(); setPlaying(true); }
    }
  }

  const fmtMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const progress = dur > 0 ? pos / dur : 0;

  return (
    <TouchableOpacity style={styles.audioPlayer} onPress={toggle} activeOpacity={0.8}>
      <Ionicons name={playing ? 'pause' : 'play'} size={18} color="#534AB7" />
      <View style={styles.audioBar}>
        <View style={[styles.audioProgress, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.audioTime}>{dur > 0 ? fmtMs(dur) : '--:--'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#534AB7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  cancelBtn: { fontSize: 15, color: '#534AB7' },
  selectCount: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  selectAllBtn: { fontSize: 15, color: '#534AB7' },
  list: { paddingHorizontal: 16 },
  dateHeader: { fontSize: 12, color: '#888', fontWeight: '500', marginTop: 12, marginBottom: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: '#E8E6E0',
  },
  cardSelected: { borderColor: '#534AB7', backgroundColor: '#F8F7FF' },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#D0CEE8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxActive: { backgroundColor: '#534AB7', borderColor: '#534AB7' },
  cardContent: { flex: 1 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  time: { fontSize: 11, color: '#aaa' },
  locBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#EEEDFE', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  locText: { fontSize: 10, color: '#534AB7', maxWidth: 100 },
  content: { fontSize: 15, color: '#1a1a1a', lineHeight: 22 },
  imgRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  imgThumb: { width: 64, height: 64, borderRadius: 6 },
  imgMore: { width: 64, height: 64, borderRadius: 6, backgroundColor: '#E8E6E0', alignItems: 'center', justifyContent: 'center' },
  imgMoreText: { fontSize: 14, color: '#666', fontWeight: '600' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: { backgroundColor: '#EEEDFE', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  tagText: { fontSize: 12, color: '#3C3489' },
  emptyContainer: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 16, color: '#aaa', fontWeight: '500' },
  emptyHint: { fontSize: 13, color: '#C0BDB5' },
  voiceBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#EEEDFE', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  voiceBadgeText: { fontSize: 10, color: '#534AB7' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  pendingText: { fontSize: 13, color: '#aaa', fontStyle: 'italic' },
  audioPlayer: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0EFFF', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, marginTop: 6, marginBottom: 4 },
  audioBar: { flex: 1, height: 4, backgroundColor: '#D0CEE8', borderRadius: 2, overflow: 'hidden' },
  audioProgress: { height: 4, backgroundColor: '#534AB7', borderRadius: 2 },
  audioTime: { fontSize: 12, color: '#534AB7', fontVariant: ['tabular-nums'] },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 14,
    borderTopWidth: 0.5,
    borderTopColor: '#E8E6E0',
    backgroundColor: '#fff',
  },
  actionBtn: { alignItems: 'center', gap: 4, flex: 1 },
  actionBtnDelete: {},
  actionBtnText: { fontSize: 12, color: '#534AB7' },
});
