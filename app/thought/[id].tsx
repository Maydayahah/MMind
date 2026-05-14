import { api, Thought, useStore, VOICE_PLACEHOLDER } from '@/hooks/useApi';
import { useTheme } from '@/hooks/useTheme';
import { ColorScheme } from '@/constants/Colors';
import MarkdownView from '@/components/MarkdownView';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import dayjs from 'dayjs';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Alert,
  Image,
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

const PRESET_TAGS = ['创作与灵感', '生活观察', '技术思考', '阅读笔记'];

interface LocationData { lat: number; lng: number; name: string; }

function parseJson<T>(raw: string, fallback: T): T {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

export default function ThoughtDetailScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const { id } = useLocalSearchParams<{ id: string }>();
  const { thoughts, updateThought, removeThought } = useStore();

  const thought = thoughts.find((t) => String(t.id) === id);

  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [ocrLoading, setOcrLoading] = useState<Set<string>>(new Set());

  const { data: related } = useQuery<Thought[]>({
    queryKey: ['related', id],
    queryFn: async () => {
      const res = await api.get(`/api/thoughts/${id}/related`);
      return res.data;
    },
    enabled: !!id && !editing,
  });

  function enterEdit() {
    if (!thought) return;
    setContent(thought.content === VOICE_PLACEHOLDER ? '' : thought.content);
    setTags(thought.tags ? thought.tags.split(',').filter(Boolean) : []);
    setImages(parseJson<string[]>(thought.images, []));
    setLocation(parseJson<LocationData | null>(thought.location, null));
    setEditing(true);
  }

  function cancelEdit() { setEditing(false); }

  async function handleSave() {
    if (!thought || !content.trim()) return;
    setSaving(true);
    try {
      const res = await api.patch(`/api/thoughts/${thought.id}`, {
        content: content.trim(),
        tags: tags.join(','),
        images: images.length ? JSON.stringify(images) : '',
        location: location ? JSON.stringify(location) : '',
      });
      updateThought(res.data);
      setEditing(false);
    } catch {
      Alert.alert('保存失败', '请检查网络连接');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!thought) return;
    Alert.alert('确认删除', '删除后无法恢复', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/api/thoughts/${thought.id}`);
            removeThought(thought.id);
            router.back();
          } catch {
            Alert.alert('删除失败');
          }
        },
      },
    ]);
  }

  async function ocrImage(uri: string) {
    setOcrLoading((prev) => new Set(prev).add(uri));
    try {
      const filename = uri.split('/').pop() || 'image.jpg';
      const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const formData = new FormData();
      formData.append('file', { uri, name: filename, type: mimeType } as unknown as Blob);
      const res = await api.post('/api/ocr', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data?.text) {
        setContent((prev) => prev.trim() ? `${prev.trim()}\n\n${res.data.text}` : res.data.text);
      }
    } catch (e: any) {
      Alert.alert('识别失败', e?.response?.data?.detail ?? '请检查图片质量或网络');
    } finally {
      setOcrLoading((prev) => { const next = new Set(prev); next.delete(uri); return next; });
    }
  }

  async function pickImage() {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) { Alert.alert('需要相册权限'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 6,
    });
    if (!result.canceled)
      setImages((p) => [...p, ...result.assets.map((a) => a.uri)].slice(0, 6));
  }

  async function getLocation() {
    setGettingLocation(true);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) { Alert.alert('需要位置权限'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;
      let name = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      try {
        const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (geo[0]) {
          const g = geo[0];
          name = [g.district, g.city, g.region].filter(Boolean).join(' ') || name;
        }
      } catch {}
      setLocation({ lat, lng, name });
    } catch { Alert.alert('获取位置失败'); }
    finally { setGettingLocation(false); }
  }

  if (!thought) {
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <Text style={s.notFound}>随想不存在或已删除</Text>
      </SafeAreaView>
    );
  }

  const viewImages = parseJson<string[]>(thought.images, []);
  const viewLocation = parseJson<LocationData | null>(thought.location, null);
  const viewTags = thought.tags ? thought.tags.split(',').filter(Boolean) : [];
  const isPending = thought.content === VOICE_PLACEHOLDER;

  return (
    <SafeAreaView style={s.safeArea}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <View style={s.headerRight}>
          {editing ? (
            <>
              <TouchableOpacity onPress={cancelEdit} style={s.headerBtn}>
                <Text style={s.headerBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                style={[s.headerBtn, s.headerBtnPrimary]}
                disabled={saving}
              >
                <Text style={s.headerBtnPrimaryText}>{saving ? '保存中' : '保存'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={enterEdit} style={s.headerBtn}>
                <Ionicons name="create-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={s.headerBtn}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {editing ? (
        <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">
            <TextInput
              style={s.editInput}
              multiline
              autoFocus
              value={content}
              onChangeText={setContent}
              placeholder="写点什么…"
              placeholderTextColor={colors.placeholder}
              textAlignVertical="top"
            />

            {images.length > 0 && (
              <View style={s.imageRow}>
                {images.map((uri) => (
                  <View key={uri} style={s.imageThumb}>
                    <Image source={{ uri }} style={s.thumbImg} />
                    <TouchableOpacity
                      style={s.removeImg}
                      onPress={() => setImages((p) => p.filter((u) => u !== uri))}
                    >
                      <Ionicons name="close-circle" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.ocrBtn} onPress={() => ocrImage(uri)} disabled={ocrLoading.has(uri)}>
                      {ocrLoading.has(uri)
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Ionicons name="scan-outline" size={15} color="#fff" />
                      }
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {location && (
              <View style={s.locationChip}>
                <Ionicons name="location" size={13} color={colors.primary} />
                <Text style={s.locationText} numberOfLines={1}>{location.name}</Text>
                <TouchableOpacity onPress={() => setLocation(null)}>
                  <Ionicons name="close" size={14} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            <View style={s.tagSelector}>
              {PRESET_TAGS.map((tag) => {
                const active = tags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[s.tagPill, active && s.tagPillActive]}
                    onPress={() => setTags((p) => p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag])}
                  >
                    <Text style={[s.tagPillText, active && s.tagPillTextActive]}>{tag}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <View style={s.editToolbar}>
            <TouchableOpacity style={s.toolBtn} onPress={pickImage}>
              <Ionicons name="image-outline" size={22} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={s.toolBtn} onPress={getLocation} disabled={gettingLocation}>
              <Ionicons
                name={location ? 'location' : 'location-outline'}
                size={22}
                color={gettingLocation ? colors.primaryMuted : colors.primary}
              />
            </TouchableOpacity>
            <Text style={s.charCount}>{content.length} 字</Text>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.metaRow}>
            <Text style={s.metaTime}>
              {new Date(thought.created_at).toLocaleString('zh-CN', {
                month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </Text>
            {thought.audio ? (
              <View style={s.voiceBadge}>
                <Ionicons name="mic" size={11} color={colors.primary} />
                <Text style={s.voiceBadgeText}>语音随想</Text>
              </View>
            ) : null}
          </View>

          {thought.audio ? <AudioPlayer uri={thought.audio} colors={colors} s={s} /> : null}

          {isPending ? (
            <View style={s.pendingBox}>
              <Ionicons name="hourglass-outline" size={16} color={colors.textTertiary} />
              <Text style={s.pendingText}>后台转录中，稍后刷新查看文字内容…</Text>
            </View>
          ) : (
            <MarkdownView content={thought.content} colors={colors} />
          )}

          {viewImages.length > 0 && (
            <View style={s.imageGrid}>
              {viewImages.map((uri, i) => (
                <Image key={i} source={{ uri }} style={s.gridImg} />
              ))}
            </View>
          )}

          {viewLocation && (
            <View style={s.infoRow}>
              <Ionicons name="location" size={14} color={colors.primary} />
              <Text style={s.infoText}>{viewLocation.name}</Text>
            </View>
          )}

          {viewTags.length > 0 && (
            <View style={s.tagRow}>
              {viewTags.map((tag) => (
                <View key={tag} style={s.tag}>
                  <Text style={s.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {related && related.length > 0 && (
            <View style={s.relatedSection}>
              <View style={s.relatedHeader}>
                <Ionicons name="git-branch-outline" size={14} color={colors.primary} />
                <Text style={s.relatedTitle}>相关随想</Text>
              </View>
              {related.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={s.relatedCard}
                  onPress={() => router.push(`/thought/${t.id}`)}
                  activeOpacity={0.8}
                >
                  <Text style={s.relatedDate}>{dayjs(t.created_at).format('YYYY年M月D日')}</Text>
                  <Text style={s.relatedContent} numberOfLines={3}>{t.content}</Text>
                  {t.tags ? (
                    <View style={s.relatedTags}>
                      {t.tags.split(',').filter(Boolean).map((tag) => (
                        <View key={tag} style={s.relatedTag}>
                          <Text style={s.relatedTagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── 音频播放器 ────────────────────────────────────────────────────────────────

function AudioPlayer({
  uri,
  colors,
  s,
}: {
  uri: string;
  colors: ColorScheme;
  s: ReturnType<typeof makeStyles>;
}) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  async function toggle() {
    if (!sound) {
      const { sound: snd } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            setPos(status.positionMillis);
            setDur(status.durationMillis ?? 0);
            setPlaying(status.isPlaying);
            if (status.didJustFinish) { setPlaying(false); setPos(0); }
          }
        }
      );
      setSound(snd);
      setPlaying(true);
    } else {
      playing ? await sound.pauseAsync() : await sound.playAsync();
      setPlaying(!playing);
    }
  }

  const fmtMs = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    return `${Math.floor(sec / 60).toString().padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`;
  };

  return (
    <TouchableOpacity style={s.audioPlayer} onPress={toggle} activeOpacity={0.8}>
      <Ionicons name={playing ? 'pause-circle' : 'play-circle'} size={32} color={colors.primary} />
      <View style={s.audioInfo}>
        <View style={s.audioBarBg}>
          <View style={[s.audioBarFill, { width: `${dur > 0 ? (pos / dur) * 100 : 0}%` }]} />
        </View>
        <Text style={s.audioTime}>{dur > 0 ? `${fmtMs(pos)} / ${fmtMs(dur)}` : '语音备忘录'}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(c: ColorScheme) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: c.bg },
    flex: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
    backBtn: { padding: 4 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    headerBtn: { padding: 8 },
    headerBtnPrimary: { backgroundColor: c.primary, borderRadius: 8, paddingHorizontal: 14 },
    headerBtnText: { fontSize: 15, color: c.primary },
    headerBtnPrimaryText: { fontSize: 15, color: '#fff', fontWeight: '600' },
    notFound: { textAlign: 'center', marginTop: 60, color: c.textTertiary, fontSize: 15 },
    scroll: { flex: 1, paddingHorizontal: 16 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 4 },
    metaTime: { fontSize: 13, color: c.textTertiary },
    voiceBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.primaryLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
    voiceBadgeText: { fontSize: 11, color: c.primary, fontWeight: '500' },
    audioPlayer: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.audioBg, borderRadius: 14, padding: 14, marginBottom: 14 },
    audioInfo: { flex: 1, gap: 6 },
    audioBarBg: { height: 4, backgroundColor: c.audioBar, borderRadius: 2, overflow: 'hidden' },
    audioBarFill: { height: 4, backgroundColor: c.primary, borderRadius: 2 },
    audioTime: { fontSize: 12, color: c.textSecondary },
    contentText: { fontSize: 16, color: c.text, lineHeight: 28 },
    pendingBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, backgroundColor: c.inputBg, borderRadius: 10, marginBottom: 12 },
    pendingText: { fontSize: 14, color: c.textTertiary, fontStyle: 'italic' },
    imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    gridImg: { width: 100, height: 100, borderRadius: 8 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
    infoText: { fontSize: 13, color: c.primary },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    tag: { backgroundColor: c.primaryLight, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
    tagText: { fontSize: 13, color: c.primaryDark },
    relatedSection: { marginTop: 24, paddingTop: 20, borderTopWidth: 0.5, borderTopColor: c.border },
    relatedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    relatedTitle: { fontSize: 13, fontWeight: '600', color: c.primary },
    relatedCard: {
      backgroundColor: c.cardSelected,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
      borderLeftWidth: 2,
      borderLeftColor: c.primary,
    },
    relatedDate: { fontSize: 11, color: c.textTertiary, marginBottom: 4 },
    relatedContent: { fontSize: 14, color: c.text, lineHeight: 20 },
    relatedTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
    relatedTag: { backgroundColor: c.primaryLight, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
    relatedTagText: { fontSize: 11, color: c.primaryDark },
    editInput: { fontSize: 16, color: c.text, lineHeight: 26, minHeight: 200, paddingTop: 4 },
    imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    imageThumb: { position: 'relative', width: 80, height: 80 },
    thumbImg: { width: 80, height: 80, borderRadius: 8 },
    removeImg: { position: 'absolute', top: -6, right: -6 },
    ocrBtn: { position: 'absolute', bottom: -6, left: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    locationChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10, backgroundColor: c.primaryLight, alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
    locationText: { fontSize: 12, color: c.primary, maxWidth: 200 },
    tagSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    tagPill: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: c.checkboxBorder, backgroundColor: c.cardSelected },
    tagPillActive: { backgroundColor: c.primary, borderColor: c.primary },
    tagPillText: { fontSize: 13, color: c.textSecondary },
    tagPillTextActive: { color: '#fff', fontWeight: '500' },
    editToolbar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: c.border, backgroundColor: c.card },
    toolBtn: { padding: 8 },
    charCount: { marginLeft: 'auto', fontSize: 13, color: c.textTertiary, paddingRight: 8 },
  });
}
