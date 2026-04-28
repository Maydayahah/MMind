import { api, Collection, Thought, useStore } from '@/hooks/useApi';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const THEME_OPTIONS = ['创作与灵感', '生活观察', '技术思考', '阅读笔记'];

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { collections, updateCollection, removeCollection } = useStore();

  // Prefer store (instant updates after edit), fall back to API fetch
  const storeCollection = collections.find((c) => String(c.id) === id);

  const { data: fetched, isLoading } = useQuery<Collection>({
    queryKey: ['collection', id],
    queryFn: async () => {
      const res = await api.get(`/api/collections/${id}`);
      return res.data;
    },
    enabled: !!id && !storeCollection,
  });

  const collection = storeCollection ?? fetched;

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function enterEdit() {
    if (!collection) return;
    setTitle(collection.title);
    setTheme(collection.theme);
    setContent(collection.content);
    setEditing(true);
  }

  function cancelEdit() { setEditing(false); }

  async function handleSave() {
    if (!collection || !title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const res = await api.patch(`/api/collections/${collection.id}`, {
        title: title.trim(),
        theme,
        content: content.trim(),
      });
      updateCollection(res.data);
      setEditing(false);
    } catch {
      Alert.alert('保存失败', '请检查网络连接');
    } finally {
      setSaving(false);
    }
  }

  async function confirmAndDelete() {
    if (!collection) return;
    try {
      await api.delete(`/api/collections/${collection.id}`);
      removeCollection(collection.id);
      router.back();
    } catch {
      setConfirmDelete(false);
    }
  }

  const thoughtIds = collection?.thought_ids
    ? collection.thought_ids.split(',').filter(Boolean)
    : [];

  const { data: linkedThoughts = [] } = useQuery<Thought[]>({
    queryKey: ['collection-thoughts', id],
    queryFn: async () => {
      const res = await api.get(`/api/thoughts?ids=${thoughtIds.join(',')}`);
      return res.data;
    },
    enabled: thoughtIds.length > 0,
  });

  if (isLoading && !storeCollection) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ActivityIndicator style={{ flex: 1 }} color="#534AB7" />
      </SafeAreaView>
    );
  }

  if (!collection) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#534AB7" />
          </TouchableOpacity>
        </View>
        <Text style={styles.notFound}>文集不存在或已删除</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color="#534AB7" />
        </TouchableOpacity>
        {editing ? (
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={cancelEdit} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.headerBtn, styles.headerBtnPrimary]}
              disabled={saving}
            >
              <Text style={styles.headerBtnPrimaryText}>{saving ? '保存中' : '保存'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.headerRight}>
            <Text style={styles.period} numberOfLines={1}>{collection.period}</Text>
            <TouchableOpacity onPress={enterEdit} style={styles.headerBtn}>
              <Ionicons name="create-outline" size={20} color="#534AB7" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setConfirmDelete(true)} style={styles.headerBtn}>
              <Ionicons name="trash-outline" size={20} color="#E53935" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {editing ? (
        /* ── 编辑模式 ── */
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="文集标题"
              placeholderTextColor="#C0BDB5"
            />

            {/* 主题选择 */}
            <Text style={styles.sectionLabel}>主题</Text>
            <View style={styles.themeRow}>
              {THEME_OPTIONS.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.themePill, theme === t && styles.themePillActive]}
                  onPress={() => setTheme(t)}
                >
                  <Text style={[styles.themePillText, theme === t && styles.themePillTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>正文</Text>
            <TextInput
              style={styles.contentInput}
              multiline
              value={content}
              onChangeText={setContent}
              placeholder="文集内容（支持 Markdown）"
              placeholderTextColor="#C0BDB5"
              textAlignVertical="top"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        /* ── 查看模式 ── */
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* 文集正文 */}
          <SimpleMarkdown content={collection.content} />

          {/* 关联随想 */}
          {linkedThoughts.length > 0 && (
            <View style={styles.linkedSection}>
              <View style={styles.linkedHeader}>
                <Ionicons name="link-outline" size={14} color="#534AB7" />
                <Text style={styles.linkedTitle}>关联随想 · {linkedThoughts.length} 条</Text>
              </View>
              {linkedThoughts.map((t) => (
                <LinkedThoughtCard key={t.id} thought={t} />
              ))}
            </View>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>来源 {thoughtIds.length} 条随想</Text>
          </View>
        </ScrollView>
      )}

      {/* 删除确认栏 */}
      {confirmDelete && (
        <View style={styles.confirmBar}>
          <Text style={styles.confirmText}>确认删除这篇文集？</Text>
          <TouchableOpacity onPress={() => setConfirmDelete(false)} style={styles.confirmCancelBtn}>
            <Text style={styles.confirmCancelText}>取消</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmAndDelete} style={styles.confirmDeleteBtn}>
            <Text style={styles.confirmDeleteText}>删除</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

function LinkedThoughtCard({ thought }: { thought: Thought }) {
  const tags = thought.tags ? thought.tags.split(',').filter(Boolean) : [];
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.linkedCard}
      onPress={() => router.push(`/thought/${thought.id}`)}
    >
      <Text style={styles.linkedTime}>{dayjs(thought.created_at).format('MM-DD HH:mm')}</Text>
      <Text style={styles.linkedContent} numberOfLines={3}>{thought.content}</Text>
      {tags.length > 0 && (
        <View style={styles.tagRow}>
          {tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── 轻量 Markdown 渲染 ────────────────────────────────────────────────────────

function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <View style={md.container}>
      {lines.map((line, i) => {
        if (/^### (.+)/.test(line)) return <Text key={i} style={md.h3}>{line.replace(/^### /, '')}</Text>;
        if (/^## (.+)/.test(line))  return <Text key={i} style={md.h2}>{line.replace(/^## /, '')}</Text>;
        if (/^# (.+)/.test(line))   return <Text key={i} style={md.h1}>{line.replace(/^# /, '')}</Text>;
        if (/^[-*] (.+)/.test(line)) {
          return (
            <View key={i} style={md.listItem}>
              <Text style={md.bullet}>•</Text>
              <Text style={md.listText}>{line.replace(/^[-*] /, '')}</Text>
            </View>
          );
        }
        if (line.trim() === '') return <View key={i} style={md.spacer} />;
        return <InlineParagraph key={i} text={line} />;
      })}
    </View>
  );
}

function InlineParagraph({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return (
    <Text style={md.paragraph}>
      {parts.map((part, i) =>
        /^\*\*(.+)\*\*$/.test(part)
          ? <Text key={i} style={md.bold}>{part.replace(/\*\*/g, '')}</Text>
          : part
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backBtn: { padding: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { padding: 8 },
  headerBtnPrimary: { backgroundColor: '#534AB7', borderRadius: 8, paddingHorizontal: 14 },
  headerBtnText: { fontSize: 15, color: '#534AB7' },
  headerBtnPrimaryText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  period: { fontSize: 13, color: '#888', marginRight: 4 },
  notFound: { textAlign: 'center', marginTop: 60, color: '#aaa', fontSize: 15 },
  scroll: { flex: 1 },
  // 编辑模式
  titleInput: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E8E6E0',
  },
  sectionLabel: { fontSize: 12, color: '#aaa', paddingHorizontal: 20, marginTop: 14, marginBottom: 6 },
  themeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20 },
  themePill: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#D0CEE8',
    backgroundColor: '#F8F7FF',
  },
  themePillActive: { backgroundColor: '#534AB7', borderColor: '#534AB7' },
  themePillText: { fontSize: 13, color: '#666' },
  themePillTextActive: { color: '#fff', fontWeight: '500' },
  contentInput: {
    fontSize: 15,
    color: '#1a1a1a',
    lineHeight: 24,
    minHeight: 300,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  // 关联随想
  linkedSection: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 16,
    borderTopWidth: 0.5,
    borderTopColor: '#E8E6E0',
    paddingTop: 20,
  },
  linkedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  linkedTitle: { fontSize: 13, fontWeight: '600', color: '#534AB7' },
  linkedCard: {
    backgroundColor: '#F8F7FF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#534AB7',
  },
  linkedTime: { fontSize: 11, color: '#aaa', marginBottom: 4 },
  linkedContent: { fontSize: 14, color: '#1a1a1a', lineHeight: 21 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: { backgroundColor: '#EEEDFE', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, color: '#3C3489' },
  footer: { paddingVertical: 32, alignItems: 'center' },
  footerText: { fontSize: 12, color: '#C0BDB5' },
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
  confirmDeleteBtn: { backgroundColor: '#E53935', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  confirmDeleteText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});

const md = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  h1: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', marginTop: 20, marginBottom: 12, lineHeight: 30 },
  h2: { fontSize: 18, fontWeight: '600', color: '#1a1a1a', marginTop: 18, marginBottom: 8, lineHeight: 26 },
  h3: { fontSize: 16, fontWeight: '600', color: '#333', marginTop: 14, marginBottom: 6, lineHeight: 24 },
  paragraph: { fontSize: 15, color: '#2a2a2a', lineHeight: 26, marginBottom: 4 },
  bold: { fontWeight: '700', color: '#1a1a1a' },
  listItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  bullet: { fontSize: 15, color: '#534AB7', lineHeight: 26 },
  listText: { flex: 1, fontSize: 15, color: '#2a2a2a', lineHeight: 26 },
  spacer: { height: 8 },
});
