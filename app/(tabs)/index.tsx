import { api, Thought, useStore, VOICE_PLACEHOLDER } from '@/hooks/useApi';
import { useTheme } from '@/hooks/useTheme';
import { ColorScheme } from '@/constants/Colors';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import * as FileSystem from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const EMOTION_COLORS: Record<string, string> = {
  开心: '#4CAF50', 兴奋: '#FF9800', 平静: '#2196F3',
  思考: '#9C27B0', 焦虑: '#FF5722', 低落: '#78909C',
};

export default function StreamScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { thoughts, setThoughts, removeThoughts } = useStore();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [randomThought, setRandomThought] = useState<Thought | null>(null);
  const [loadingRandom, setLoadingRandom] = useState(false);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    thoughts.forEach((t) => {
      if (t.tags) t.tags.split(',').forEach((tag) => { if (tag.trim()) tagSet.add(tag.trim()); });
    });
    return Array.from(tagSet).sort();
  }, [thoughts]);

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

  const filtered = thoughts.filter((t) => {
    const q = query.trim().toLowerCase();
    const matchQuery = !q ||
      t.content.toLowerCase().includes(q) ||
      t.tags.toLowerCase().includes(q);
    const matchTag = !activeTag
      ? true
      : activeTag === '__starred__'
        ? t.starred === 1
        : t.tags.split(',').map((s) => s.trim()).includes(activeTag);
    return matchQuery && matchTag;
  });

  const todayMMDD = dayjs().format('MM-DD');
  const currentYear = dayjs().year();
  const onThisDay = thoughts.filter((t) => {
    const d = dayjs(t.created_at);
    return d.format('MM-DD') === todayMMDD && d.year() < currentYear;
  });

  const grouped = filtered.reduce((acc, t) => {
    const date = dayjs(t.created_at).format('YYYY-MM-DD');
    if (!acc[date]) acc[date] = [];
    acc[date].push(t);
    return acc;
  }, {} as Record<string, Thought[]>);

  const sections = Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));

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

  async function fetchRandom() {
    setLoadingRandom(true);
    try {
      const res = await api.get('/api/thoughts/random');
      setRandomThought(res.data);
    } catch {
      Alert.alert('提示', '还没有随想');
    } finally {
      setLoadingRandom(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
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
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.diceBtn} onPress={fetchRandom} activeOpacity={0.7}>
              <Ionicons name="shuffle-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/(tabs)/write')}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.addBtnText}>记录</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!selectMode && (
        <>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={16} color={colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="搜索随想内容…"
              placeholderTextColor={colors.placeholder}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={colors.placeholder} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tagFilterScroll}
            contentContainerStyle={styles.tagFilterContent}
          >
            <TouchableOpacity
              style={[styles.filterChip, !activeTag && styles.filterChipActive]}
              onPress={() => setActiveTag(null)}
            >
              <Text style={[styles.filterChipText, !activeTag && styles.filterChipTextActive]}>全部</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterChip, styles.starredChip, activeTag === '__starred__' && styles.filterChipActive]}
              onPress={() => setActiveTag((prev) => (prev === '__starred__' ? null : '__starred__'))}
            >
              <Ionicons name={activeTag === '__starred__' ? 'star' : 'star-outline'} size={12} color={activeTag === '__starred__' ? '#fff' : colors.warning} />
              <Text style={[styles.filterChipText, activeTag === '__starred__' && styles.filterChipTextActive]}>星标</Text>
            </TouchableOpacity>
            {allTags.map((tag) => (
              <TouchableOpacity
                key={tag}
                style={[styles.filterChip, activeTag === tag && styles.filterChipActive]}
                onPress={() => setActiveTag((prev) => (prev === tag ? null : tag))}
              >
                <Text style={[styles.filterChipText, activeTag === tag && styles.filterChipTextActive]}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      <FlatList
        style={styles.list}
        data={sections}
        keyExtractor={([date]) => date}
        refreshControl={
          !selectMode ? (
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} colors={[colors.primary]} />
          ) : undefined
        }
        ListHeaderComponent={
          !selectMode && !query && !activeTag && onThisDay.length > 0 ? (
            <OnThisDayCard thoughts={onThisDay} colors={colors} styles={styles} />
          ) : null
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
                colors={colors}
                styles={styles}
              />
            ))}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="leaf-outline" size={40} color={colors.iconMuted} />
            <Text style={styles.emptyText}>{query || activeTag ? '没有匹配的随想' : '还没有随想'}</Text>
            <Text style={styles.emptyHint}>{query || activeTag ? '换个关键词或标签试试' : '点击右上角「记录」开始记录'}</Text>
          </View>
        }
      />

      {selectMode && selectedIds.size > 0 && (
        <View style={styles.actionBar}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleBatchOrganize}>
            <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
            <Text style={styles.actionBtnText}>整理</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleBatchExport}>
            <Ionicons name="share-outline" size={20} color={colors.primary} />
            <Text style={styles.actionBtnText}>导出</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDelete]} onPress={handleBatchDelete}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={[styles.actionBtnText, { color: colors.danger }]}>删除</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={randomThought !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRandomThought(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setRandomThought(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.randomCard}>
            <View style={styles.randomHeader}>
              <View style={styles.randomHeaderLeft}>
                <Ionicons name="shuffle-outline" size={14} color={colors.primary} />
                <Text style={styles.randomLabel}>随机回顾</Text>
              </View>
              <TouchableOpacity onPress={() => setRandomThought(null)}>
                <Ionicons name="close" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            {randomThought && (
              <>
                <Text style={styles.randomDate}>
                  {dayjs(randomThought.created_at).format('YYYY年M月D日 HH:mm')}
                </Text>
                <ScrollView style={styles.randomScroll} showsVerticalScrollIndicator={false}>
                  <Text style={styles.randomContent}>{randomThought.content}</Text>
                </ScrollView>
                {randomThought.tags ? (
                  <View style={styles.tagRow}>
                    {randomThought.tags.split(',').filter(Boolean).map((tag) => (
                      <View key={tag} style={styles.tag}>
                        <Text style={styles.tagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            )}

            <View style={styles.randomActions}>
              <TouchableOpacity
                style={styles.randomSecondaryBtn}
                onPress={fetchRandom}
                disabled={loadingRandom}
              >
                <Ionicons name="shuffle-outline" size={15} color={colors.primary} />
                <Text style={styles.randomSecondaryText}>换一条</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.randomPrimaryBtn}
                onPress={() => {
                  if (randomThought) {
                    setRandomThought(null);
                    router.push(`/thought/${randomThought.id}`);
                  }
                }}
              >
                <Text style={styles.randomPrimaryText}>查看详情</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ── 历史上的今天 ───────────────────────────────────────────────────────────────

function OnThisDayCard({
  thoughts,
  colors,
  styles,
}: {
  thoughts: Thought[];
  colors: ColorScheme;
  styles: ReturnType<typeof makeStyles>;
}) {
  const byYear = thoughts.reduce((acc, t) => {
    const y = dayjs(t.created_at).year();
    if (!acc[y]) acc[y] = [];
    acc[y].push(t);
    return acc;
  }, {} as Record<number, Thought[]>);

  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  return (
    <View style={styles.onThisDay}>
      <View style={styles.onThisDayHeader}>
        <Ionicons name="calendar-outline" size={14} color={colors.primary} />
        <Text style={styles.onThisDayTitle}>历史上的今天</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {years.map((year) =>
          byYear[year].slice(0, 2).map((t) => (
            <TouchableOpacity
              key={t.id}
              style={styles.onThisDayCard}
              onPress={() => router.push(`/thought/${t.id}`)}
              activeOpacity={0.8}
            >
              <Text style={styles.onThisDayYear}>{year} 年</Text>
              <Text style={styles.onThisDayContent} numberOfLines={3}>{t.content}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ── ThoughtCard ───────────────────────────────────────────────────────────────

function ThoughtCard({
  thought,
  selectMode,
  selected,
  onLongPress,
  onPress,
  colors,
  styles,
}: {
  thought: Thought;
  selectMode: boolean;
  selected: boolean;
  onLongPress: () => void;
  onPress: () => void;
  colors: ColorScheme;
  styles: ReturnType<typeof makeStyles>;
}) {
  const tags = thought.tags ? thought.tags.split(',').filter(Boolean) : [];
  let imgs: string[] = [];
  try { if (thought.images) imgs = JSON.parse(thought.images); } catch {}
  let locName = '';
  try { if (thought.location) locName = JSON.parse(thought.location).name; } catch {}

  const isVoice = !!thought.audio;
  const isPending = thought.content === VOICE_PLACEHOLDER;
  const { updateThought } = useStore();

  async function toggleStar() {
    try {
      const res = await api.patch(`/api/thoughts/${thought.id}/star`);
      updateThought(res.data);
    } catch {}
  }

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
            {!!thought.emotion && (
              <View style={[styles.emotionDot, { backgroundColor: EMOTION_COLORS[thought.emotion] ?? '#aaa' }]} />
            )}
            {isVoice && (
              <View style={styles.voiceBadge}>
                <Ionicons name="mic" size={10} color={colors.primary} />
                <Text style={styles.voiceBadgeText}>语音</Text>
              </View>
            )}
            {locName ? (
              <View style={styles.locBadge}>
                <Ionicons name="location" size={10} color={colors.primary} />
                <Text style={styles.locText} numberOfLines={1}>{locName}</Text>
              </View>
            ) : null}
            {!selectMode && (
              <TouchableOpacity onPress={toggleStar} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.starBtn}>
                <Ionicons
                  name={thought.starred ? 'star' : 'star-outline'}
                  size={14}
                  color={thought.starred ? colors.warning : colors.textTertiary}
                />
              </TouchableOpacity>
            )}
          </View>

          {isVoice && <AudioPlayer uri={thought.audio} colors={colors} styles={styles} />}

          {isPending ? (
            <View style={styles.pendingRow}>
              <Ionicons name="hourglass-outline" size={13} color={colors.textTertiary} />
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

function AudioPlayer({
  uri,
  colors,
  styles,
}: {
  uri: string;
  colors: ColorScheme;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

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
      <Ionicons name={playing ? 'pause' : 'play'} size={18} color={colors.primary} />
      <View style={styles.audioBar}>
        <View style={[styles.audioProgress, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.audioTime}>{dur > 0 ? fmtMs(dur) : '--:--'}</Text>
    </TouchableOpacity>
  );
}

function makeStyles(c: ColorScheme) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    title: { fontSize: 22, fontWeight: '700', color: c.text },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    addBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    cancelBtn: { fontSize: 15, color: c.primary },
    selectCount: { fontSize: 15, fontWeight: '600', color: c.text },
    selectAllBtn: { fontSize: 15, color: c.primary },
    list: { paddingHorizontal: 16 },
    dateHeader: { fontSize: 12, color: c.textSecondary, fontWeight: '500', marginTop: 12, marginBottom: 8 },
    card: {
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 0.5,
      borderColor: c.border,
    },
    cardSelected: { borderColor: c.primary, backgroundColor: c.cardSelected },
    cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: c.checkboxBorder,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    checkboxActive: { backgroundColor: c.primary, borderColor: c.primary },
    cardContent: { flex: 1 },
    cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    time: { fontSize: 11, color: c.textTertiary },
    emotionDot: { width: 7, height: 7, borderRadius: 4 },
    locBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: c.primaryLight, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
    locText: { fontSize: 10, color: c.primary, maxWidth: 100 },
    content: { fontSize: 15, color: c.text, lineHeight: 22 },
    imgRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
    imgThumb: { width: 64, height: 64, borderRadius: 6 },
    imgMore: { width: 64, height: 64, borderRadius: 6, backgroundColor: c.border, alignItems: 'center', justifyContent: 'center' },
    imgMoreText: { fontSize: 14, color: c.textSecondary, fontWeight: '600' },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    tag: { backgroundColor: c.primaryLight, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    tagText: { fontSize: 12, color: c.primaryDark },
    emptyContainer: { alignItems: 'center', paddingTop: 80, gap: 8 },
    emptyText: { fontSize: 16, color: c.textTertiary, fontWeight: '500' },
    emptyHint: { fontSize: 13, color: c.placeholder },
    voiceBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: c.primaryLight, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
    voiceBadgeText: { fontSize: 10, color: c.primary },
    pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
    pendingText: { fontSize: 13, color: c.textTertiary, fontStyle: 'italic' },
    audioPlayer: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.audioBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, marginTop: 6, marginBottom: 4 },
    audioBar: { flex: 1, height: 4, backgroundColor: c.audioBar, borderRadius: 2, overflow: 'hidden' },
    audioProgress: { height: 4, backgroundColor: c.primary, borderRadius: 2 },
    audioTime: { fontSize: 12, color: c.primary, fontVariant: ['tabular-nums'] },
    actionBar: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingVertical: 14,
      borderTopWidth: 0.5,
      borderTopColor: c.border,
      backgroundColor: c.card,
    },
    actionBtn: { alignItems: 'center', gap: 4, flex: 1 },
    actionBtnDelete: {},
    actionBtnText: { fontSize: 12, color: c.primary },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 10,
      backgroundColor: c.inputBg,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    searchInput: { flex: 1, fontSize: 14, color: c.text, padding: 0 },
    tagFilterScroll: { flexGrow: 0, marginBottom: 4 },
    tagFilterContent: { paddingHorizontal: 16, gap: 8, paddingBottom: 6 },
    filterChip: {
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 6,
      backgroundColor: c.inputBg,
      borderWidth: 1,
      borderColor: c.border,
    },
    starredChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10 },
    filterChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    filterChipText: { fontSize: 13, color: c.textSecondary },
    filterChipTextActive: { color: '#fff', fontWeight: '600' },
    starBtn: { marginLeft: 'auto' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    diceBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    randomCard: {
      width: '100%',
      maxHeight: '70%',
      backgroundColor: c.card,
      borderRadius: 20,
      padding: 20,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 20,
      elevation: 8,
    },
    randomHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    randomHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    randomLabel: { fontSize: 14, fontWeight: '600', color: c.primary },
    randomDate: { fontSize: 12, color: c.textTertiary, marginBottom: 12 },
    randomScroll: { maxHeight: 240, marginBottom: 12 },
    randomContent: { fontSize: 16, color: c.text, lineHeight: 26 },
    randomActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    randomSecondaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingVertical: 11,
      borderRadius: 12,
      backgroundColor: c.primaryLight,
    },
    randomSecondaryText: { fontSize: 14, color: c.primary, fontWeight: '500' },
    randomPrimaryBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 11,
      borderRadius: 12,
      backgroundColor: c.primary,
    },
    randomPrimaryText: { fontSize: 14, color: '#fff', fontWeight: '600' },
    onThisDay: {
      marginBottom: 12,
      backgroundColor: c.primaryLight,
      borderRadius: 14,
      padding: 14,
    },
    onThisDayHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    onThisDayTitle: { fontSize: 13, fontWeight: '600', color: c.primary },
    onThisDayCard: {
      width: 180,
      backgroundColor: c.card,
      borderRadius: 10,
      padding: 12,
      borderLeftWidth: 3,
      borderLeftColor: c.primary,
    },
    onThisDayYear: { fontSize: 11, color: c.primary, fontWeight: '600', marginBottom: 4 },
    onThisDayContent: { fontSize: 13, color: c.text, lineHeight: 19 },
  });
}
