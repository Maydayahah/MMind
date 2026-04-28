import { api, Thought, useStore, VOICE_PLACEHOLDER } from '@/hooks/useApi';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
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

  // 进入编辑时初始化字段
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
            <Ionicons name="chevron-back" size={24} color="#534AB7" />
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
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#534AB7" />
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
                <Ionicons name="create-outline" size={20} color="#534AB7" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={s.headerBtn}>
                <Ionicons name="trash-outline" size={20} color="#E53935" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Body */}
      {editing ? (
        /* ── 编辑模式 ── */
        <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">
            <TextInput
              style={s.editInput}
              multiline
              autoFocus
              value={content}
              onChangeText={setContent}
              placeholder="写点什么…"
              placeholderTextColor="#C0BDB5"
              textAlignVertical="top"
            />

            {/* 图片编辑 */}
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
                  </View>
                ))}
              </View>
            )}

            {/* 位置编辑 */}
            {location && (
              <View style={s.locationChip}>
                <Ionicons name="location" size={13} color="#534AB7" />
                <Text style={s.locationText} numberOfLines={1}>{location.name}</Text>
                <TouchableOpacity onPress={() => setLocation(null)}>
                  <Ionicons name="close" size={14} color="#888" />
                </TouchableOpacity>
              </View>
            )}

            {/* 标签编辑 */}
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

          {/* 编辑工具栏 */}
          <View style={s.editToolbar}>
            <TouchableOpacity style={s.toolBtn} onPress={pickImage}>
              <Ionicons name="image-outline" size={22} color="#534AB7" />
            </TouchableOpacity>
            <TouchableOpacity style={s.toolBtn} onPress={getLocation} disabled={gettingLocation}>
              <Ionicons
                name={location ? 'location' : 'location-outline'}
                size={22}
                color={gettingLocation ? '#C5C3D9' : '#534AB7'}
              />
            </TouchableOpacity>
            <Text style={s.charCount}>{content.length} 字</Text>
          </View>
        </KeyboardAvoidingView>
      ) : (
        /* ── 查看模式 ── */
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
          {/* 元信息 */}
          <View style={s.metaRow}>
            <Text style={s.metaTime}>
              {new Date(thought.created_at).toLocaleString('zh-CN', {
                month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </Text>
            {thought.audio ? (
              <View style={s.voiceBadge}>
                <Ionicons name="mic" size={11} color="#534AB7" />
                <Text style={s.voiceBadgeText}>语音随想</Text>
              </View>
            ) : null}
          </View>

          {/* 语音播放 */}
          {thought.audio ? <AudioPlayer uri={thought.audio} /> : null}

          {/* 正文 */}
          {isPending ? (
            <View style={s.pendingBox}>
              <Ionicons name="hourglass-outline" size={16} color="#aaa" />
              <Text style={s.pendingText}>后台转录中，稍后刷新查看文字内容…</Text>
            </View>
          ) : (
            <Text style={s.contentText}>{thought.content}</Text>
          )}

          {/* 图片 */}
          {viewImages.length > 0 && (
            <View style={s.imageGrid}>
              {viewImages.map((uri, i) => (
                <Image key={i} source={{ uri }} style={s.gridImg} />
              ))}
            </View>
          )}

          {/* 位置 */}
          {viewLocation && (
            <View style={s.infoRow}>
              <Ionicons name="location" size={14} color="#534AB7" />
              <Text style={s.infoText}>{viewLocation.name}</Text>
            </View>
          )}

          {/* 标签 */}
          {viewTags.length > 0 && (
            <View style={s.tagRow}>
              {viewTags.map((tag) => (
                <View key={tag} style={s.tag}>
                  <Text style={s.tagText}>{tag}</Text>
                </View>
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

function AudioPlayer({ uri }: { uri: string }) {
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
            if (status.didJustFinish) { setPlaying(false); setPos(0); }
          }
        }
      );
      setSound(s);
      setPlaying(true);
    } else {
      playing ? await sound.pauseAsync() : await sound.playAsync();
      setPlaying(!playing);
    }
  }

  const fmtMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  };

  return (
    <TouchableOpacity style={s.audioPlayer} onPress={toggle} activeOpacity={0.8}>
      <Ionicons name={playing ? 'pause-circle' : 'play-circle'} size={32} color="#534AB7" />
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

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  backBtn: { padding: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { padding: 8 },
  headerBtnPrimary: { backgroundColor: '#534AB7', borderRadius: 8, paddingHorizontal: 14 },
  headerBtnText: { fontSize: 15, color: '#534AB7' },
  headerBtnPrimaryText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  notFound: { textAlign: 'center', marginTop: 60, color: '#aaa', fontSize: 15 },
  scroll: { flex: 1, paddingHorizontal: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 4 },
  metaTime: { fontSize: 13, color: '#aaa' },
  voiceBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EEEDFE', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  voiceBadgeText: { fontSize: 11, color: '#534AB7', fontWeight: '500' },
  audioPlayer: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F0EFFF', borderRadius: 14, padding: 14, marginBottom: 14 },
  audioInfo: { flex: 1, gap: 6 },
  audioBarBg: { height: 4, backgroundColor: '#D0CEE8', borderRadius: 2, overflow: 'hidden' },
  audioBarFill: { height: 4, backgroundColor: '#534AB7', borderRadius: 2 },
  audioTime: { fontSize: 12, color: '#888' },
  contentText: { fontSize: 16, color: '#1a1a1a', lineHeight: 28 },
  pendingBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, backgroundColor: '#F5F5F5', borderRadius: 10, marginBottom: 12 },
  pendingText: { fontSize: 14, color: '#aaa', fontStyle: 'italic' },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  gridImg: { width: 100, height: 100, borderRadius: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  infoText: { fontSize: 13, color: '#534AB7' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tag: { backgroundColor: '#EEEDFE', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  tagText: { fontSize: 13, color: '#3C3489' },
  // 编辑模式
  editInput: { fontSize: 16, color: '#1a1a1a', lineHeight: 26, minHeight: 200, paddingTop: 4 },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  imageThumb: { position: 'relative', width: 80, height: 80 },
  thumbImg: { width: 80, height: 80, borderRadius: 8 },
  removeImg: { position: 'absolute', top: -6, right: -6 },
  locationChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10, backgroundColor: '#EEEDFE', alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  locationText: { fontSize: 12, color: '#534AB7', maxWidth: 200 },
  tagSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tagPill: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: '#D0CEE8', backgroundColor: '#F8F7FF' },
  tagPillActive: { backgroundColor: '#534AB7', borderColor: '#534AB7' },
  tagPillText: { fontSize: 13, color: '#666' },
  tagPillTextActive: { color: '#fff', fontWeight: '500' },
  editToolbar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: '#E8E6E0', backgroundColor: '#fff' },
  toolBtn: { padding: 8 },
  charCount: { marginLeft: 'auto', fontSize: 13, color: '#aaa', paddingRight: 8 },
});
