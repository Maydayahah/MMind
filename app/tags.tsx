import { api } from '@/hooks/useApi';
import { useTheme } from '@/hooks/useTheme';
import { ColorScheme } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface TagItem {
  tag: string;
  count: number;
}

export default function TagsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const queryClient = useQueryClient();

  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const { data: tags = [], isLoading } = useQuery<TagItem[]>({
    queryKey: ['tags'],
    queryFn: async () => {
      const res = await api.get('/api/tags');
      return res.data;
    },
  });

  function startEdit(tag: string) {
    setEditingTag(tag);
    setEditValue(tag);
  }

  async function saveRename(oldTag: string) {
    const newTag = editValue.trim();
    setEditingTag(null);
    if (!newTag || newTag === oldTag) return;
    try {
      await api.put('/api/tags/rename', { old_tag: oldTag, new_tag: newTag });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['thoughts'] });
    } catch (e: any) {
      Alert.alert('重命名失败', e?.response?.data?.detail ?? '请稍后重试');
    }
  }

  function confirmDelete(tag: string) {
    Alert.alert('删除标签', `确认删除「${tag}」？该标签将从所有随想中移除。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/api/tags/${encodeURIComponent(tag)}`);
            queryClient.invalidateQueries({ queryKey: ['tags'] });
            queryClient.invalidateQueries({ queryKey: ['thoughts'] });
          } catch (e: any) {
            Alert.alert('删除失败', e?.response?.data?.detail ?? '请稍后重试');
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>标签管理</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}

      {!isLoading && tags.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name="pricetags-outline" size={40} color={colors.iconMuted} />
          <Text style={styles.emptyText}>还没有标签</Text>
          <Text style={styles.emptyHint}>记录随想并选择标签后出现在这里</Text>
        </View>
      )}

      <FlatList
        data={tags}
        keyExtractor={(item) => item.tag}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              {editingTag === item.tag ? (
                <TextInput
                  style={styles.renameInput}
                  value={editValue}
                  onChangeText={setEditValue}
                  autoFocus
                  onBlur={() => saveRename(item.tag)}
                  onSubmitEditing={() => saveRename(item.tag)}
                  returnKeyType="done"
                  selectTextOnFocus
                />
              ) : (
                <TouchableOpacity onPress={() => startEdit(item.tag)} activeOpacity={0.7}>
                  <Text style={styles.tagName}>{item.tag}</Text>
                </TouchableOpacity>
              )}
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{item.count}</Text>
              </View>
            </View>

            <View style={styles.rowActions}>
              {editingTag !== item.tag && (
                <TouchableOpacity onPress={() => startEdit(item.tag)} style={styles.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="pencil-outline" size={17} color={colors.primary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => confirmDelete(item.tag)} style={styles.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={17} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
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
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    backBtn: { padding: 4, width: 40 },
    title: { fontSize: 18, fontWeight: '700', color: c.text },
    list: { paddingHorizontal: 16, paddingTop: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
    },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    tagName: { fontSize: 15, color: c.text, fontWeight: '500' },
    renameInput: {
      fontSize: 15,
      color: c.text,
      fontWeight: '500',
      borderBottomWidth: 1,
      borderBottomColor: c.primary,
      paddingBottom: 2,
      minWidth: 80,
    },
    countBadge: {
      backgroundColor: c.primaryLight,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    countText: { fontSize: 12, color: c.primary, fontWeight: '600' },
    rowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    actionBtn: { padding: 4 },
    separator: { height: 0.5, backgroundColor: c.border, marginLeft: 0 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 80 },
    emptyText: { fontSize: 16, color: c.textTertiary, fontWeight: '500' },
    emptyHint: { fontSize: 13, color: c.placeholder, textAlign: 'center', paddingHorizontal: 32 },
  });
}
