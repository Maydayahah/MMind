import { api, Collection, useStore } from '@/hooks/useApi';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const THEME_COLORS: Record<string, { bg: string; text: string }> = {
  '创作与灵感': { bg: '#EEEDFE', text: '#3C3489' },
  '生活观察': { bg: '#E1F5EE', text: '#085041' },
  '技术思考': { bg: '#EEEDFE', text: '#3C3489' },
  '阅读笔记': { bg: '#FAEEDA', text: '#633806' },
};

function getThemeColor(theme: string) {
  return THEME_COLORS[theme] ?? { bg: '#F0EFFF', text: '#534AB7' };
}

export default function CollectionsScreen() {
  const { collections, setCollections, removeCollection } = useStore();
  const [organizing, setOrganizing] = useState(false);
  const [organizeMsg, setOrganizeMsg] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { refetch, isRefetching } = useQuery({
    queryKey: ['collections'],
    queryFn: async () => {
      const res = await api.get('/api/collections');
      setCollections(res.data);
      return res.data as Collection[];
    },
  });

  async function handleOrganize() {
    setOrganizing(true);
    setOrganizeMsg('');
    try {
      await api.post('/api/organize');
      setOrganizeMsg('AI 整理中，稍后刷新查看');
      setTimeout(() => { refetch(); setOrganizeMsg(''); }, 8000);
    } catch {
      setOrganizeMsg('连接失败，请检查后端');
    } finally {
      setOrganizing(false);
    }
  }

  // ── 批量选择 ──────────────────────────────────────────────────────────────

  function enterSelectMode(id: number) {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setConfirmDelete(false);
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(collections.map((c) => c.id)));
  }

  async function handleBatchDelete() {
    const ids = Array.from(selectedIds);
    setDeleting(true);
    try {
      await Promise.all(ids.map((id) => api.delete(`/api/collections/${id}`)));
      ids.forEach((id) => removeCollection(id));
      exitSelectMode();
    } catch {
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      {selectMode ? (
        <View style={styles.header}>
          <TouchableOpacity onPress={exitSelectMode}>
            <Text style={styles.cancelBtn}>取消</Text>
          </TouchableOpacity>
          <Text style={styles.selectCount}>已选 {selectedIds.size} 篇</Text>
          <TouchableOpacity onPress={selectAll}>
            <Text style={styles.selectAllBtn}>全选</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.header}>
          <Text style={styles.title}>文集册</Text>
          <TouchableOpacity
            style={[styles.organizeBtn, organizing && styles.organizeBtnDisabled]}
            onPress={handleOrganize}
            activeOpacity={0.75}
            disabled={organizing}
          >
            {organizing
              ? <ActivityIndicator size="small" color="#534AB7" />
              : <Ionicons name="sparkles-outline" size={15} color="#534AB7" />}
            <Text style={styles.organizeBtnText}>{organizing ? '整理中…' : '立即整理'}</Text>
          </TouchableOpacity>
        </View>
      )}
      {organizeMsg ? <Text style={styles.organizeMsg}>{organizeMsg}</Text> : null}

      <FlatList
        style={styles.list}
        data={collections}
        keyExtractor={(item) => String(item.id)}
        refreshing={!selectMode && isRefetching}
        onRefresh={selectMode ? undefined : refetch}
        renderItem={({ item }) => (
          <CollectionCard
            collection={item}
            selectMode={selectMode}
            selected={selectedIds.has(item.id)}
            onLongPress={() => enterSelectMode(item.id)}
            onPress={() => selectMode ? toggleSelect(item.id) : router.push(`/collection/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={40} color="#D0CFC8" />
            <Text style={styles.emptyText}>还没有文集</Text>
            <Text style={styles.emptyHint}>点击「立即整理」让 AI 生成</Text>
          </View>
        }
        contentContainerStyle={collections.length === 0 ? styles.emptyContainer : undefined}
      />

      {/* 批量操作栏 */}
      {selectMode && selectedIds.size > 0 && !confirmDelete && (
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDelete]}
            onPress={() => setConfirmDelete(true)}
          >
            <Ionicons name="trash-outline" size={20} color="#E53935" />
            <Text style={[styles.actionBtnText, { color: '#E53935' }]}>删除</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 删除确认栏 */}
      {confirmDelete && (
        <View style={styles.confirmBar}>
          <Text style={styles.confirmText}>确认删除选中的 {selectedIds.size} 篇文集？</Text>
          <TouchableOpacity onPress={() => setConfirmDelete(false)} style={styles.confirmCancelBtn} disabled={deleting}>
            <Text style={styles.confirmCancelText}>取消</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleBatchDelete} style={styles.confirmDeleteBtn} disabled={deleting}>
            {deleting
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.confirmDeleteText}>删除</Text>}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

function CollectionCard({
  collection,
  selectMode,
  selected,
  onLongPress,
  onPress,
}: {
  collection: Collection;
  selectMode: boolean;
  selected: boolean;
  onLongPress: () => void;
  onPress: () => void;
}) {
  const themeColor = getThemeColor(collection.theme);
  const thoughtCount = collection.thought_ids
    ? collection.thought_ids.split(',').filter(Boolean).length
    : 0;
  const preview = collection.content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/^[-*]\s+/gm, '')
    .trim()
    .slice(0, 120);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      <View style={styles.cardRow}>
        {selectMode && (
          <View style={[styles.checkbox, selected && styles.checkboxActive]}>
            {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={[styles.themeBadge, { backgroundColor: themeColor.bg }]}>
            <Text style={[styles.themeText, { color: themeColor.text }]}>{collection.theme}</Text>
          </View>
          <Text style={styles.cardTitle}>{collection.title}</Text>
          <Text style={styles.cardPreview} numberOfLines={3}>{preview}</Text>
          <View style={styles.cardMeta}>
            <Text style={styles.metaText}>{thoughtCount} 条随想</Text>
            {collection.period ? (
              <>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaText}>{collection.period}</Text>
              </>
            ) : null}
          </View>
        </View>
      </View>
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
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  organizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#534AB7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  organizeBtnText: { fontSize: 14, color: '#534AB7', fontWeight: '500' },
  organizeBtnDisabled: { opacity: 0.6 },
  organizeMsg: { fontSize: 13, color: '#534AB7', paddingHorizontal: 16, marginBottom: 8 },
  cancelBtn: { fontSize: 15, color: '#534AB7' },
  selectCount: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  selectAllBtn: { fontSize: 15, color: '#534AB7' },
  list: { paddingHorizontal: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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
    marginTop: 2,
  },
  checkboxActive: { backgroundColor: '#534AB7', borderColor: '#534AB7' },
  themeBadge: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 8,
  },
  themeText: { fontSize: 12, fontWeight: '500' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a1a', marginBottom: 6 },
  cardPreview: { fontSize: 14, color: '#666', lineHeight: 21, marginBottom: 10 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: '#aaa' },
  metaDot: { fontSize: 12, color: '#aaa' },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 16, color: '#aaa', fontWeight: '500' },
  emptyHint: { fontSize: 13, color: '#C0BDB5' },
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
  confirmBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 0.5,
    borderTopColor: '#E8E6E0',
    backgroundColor: '#fff',
    gap: 8,
  },
  confirmText: { flex: 1, fontSize: 14, color: '#333' },
  confirmCancelBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  confirmCancelText: { fontSize: 14, color: '#888' },
  confirmDeleteBtn: { backgroundColor: '#E53935', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, minWidth: 60, alignItems: 'center' },
  confirmDeleteText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});
