import { api, useStore, VOICE_PLACEHOLDER } from '@/hooks/useApi';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
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

type WriteMode = 'text' | 'voice';

// ─────────────────────────────────────────────────────────────────────────────

export default function WriteScreen() {
  const [mode, setMode] = useState<WriteMode>('text');
  const { text: sharedText } = useLocalSearchParams<{ text?: string }>();

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* 模式切换 */}
      <View style={styles.modeBar}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'text' && styles.modeBtnActive]}
          onPress={() => setMode('text')}
        >
          <Ionicons name="create-outline" size={16} color={mode === 'text' ? '#534AB7' : '#999'} />
          <Text style={[styles.modeBtnText, mode === 'text' && styles.modeBtnTextActive]}>文字</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'voice' && styles.modeBtnActive]}
          onPress={() => setMode('voice')}
        >
          <Ionicons name="mic-outline" size={16} color={mode === 'voice' ? '#534AB7' : '#999'} />
          <Text style={[styles.modeBtnText, mode === 'voice' && styles.modeBtnTextActive]}>语音备忘</Text>
        </TouchableOpacity>
      </View>

      {mode === 'text' ? <TextModeScreen sharedText={sharedText} /> : <VoiceModeScreen />}
    </SafeAreaView>
  );
}

// ── 文字模式 ──────────────────────────────────────────────────────────────────

function TextModeScreen({ sharedText }: { sharedText?: string }) {
  const [content, setContent] = useState('');
  const [clipboardBanner, setClipboardBanner] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const { addThought } = useStore();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  // 处理来自分享扩展的内容
  useEffect(() => {
    if (sharedText?.trim()) {
      setContent(sharedText.trim());
      setClipboardBanner(null);
    }
  }, [sharedText]);

  // 检测剪贴板（仅在没有分享内容时）
  useEffect(() => {
    if (sharedText?.trim()) return;
    Clipboard.getStringAsync().then((text) => {
      if (text?.trim()) setClipboardBanner(text.trim());
    });
  }, []);

  function importClipboard() {
    if (!clipboardBanner) return;
    setContent((prev) => prev.trim() ? `${prev.trim()}\n\n${clipboardBanner}` : clipboardBanner);
    setClipboardBanner(null);
  }

  useEffect(() => {
    if (isRecording) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.35, duration: 550, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 550, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  async function pickImage() {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) { Alert.alert('需要相册权限'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 6,
    });
    if (!result.canceled) setImages((p) => [...p, ...result.assets.map((a) => a.uri)].slice(0, 6));
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

  function toggleTag(tag: string) {
    setSelectedTags((p) => p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag]);
  }

  async function startRecording() {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { Alert.alert('需要麦克风权限'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(rec); setIsRecording(true);
    } catch { Alert.alert('录音失败'); }
  }

  async function stopRecording() {
    if (!recording) return;
    setIsRecording(false);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI(); setRecording(null);
      if (!uri) return;
      const formData = new FormData();
      formData.append('file', { uri, name: 'audio.m4a', type: 'audio/m4a' } as unknown as Blob);
      const res = await api.post('/api/transcribe', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data?.text) setContent((p) => p ? `${p} ${res.data.text}` : res.data.text);
    } catch { Alert.alert('转录失败'); }
  }

  async function handleSave() {
    const trimmed = content.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await api.post('/api/thoughts', {
        content: trimmed,
        images: images.length ? JSON.stringify(images) : '',
        location: location ? JSON.stringify(location) : '',
      });
      addThought({ ...res.data, tags: selectedTags.join(',') || res.data.tags });
      setContent(''); setImages([]); setLocation(null); setSelectedTags([]);
      router.replace('/(tabs)/');
    } catch { Alert.alert('保存失败'); }
    finally { setSaving(false); }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <Text style={styles.title}>写随想</Text>
        <Text style={styles.count}>{content.length} 字</Text>
      </View>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* 剪贴板 / 分享内容导入提示 */}
        {clipboardBanner && (
          <View style={styles.clipboardBanner}>
            <Ionicons name="clipboard-outline" size={14} color="#534AB7" />
            <Text style={styles.clipboardPreview} numberOfLines={1}>
              {clipboardBanner}
            </Text>
            <TouchableOpacity onPress={importClipboard} style={styles.clipboardImportBtn}>
              <Text style={styles.clipboardImportText}>导入</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setClipboardBanner(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={14} color="#aaa" />
            </TouchableOpacity>
          </View>
        )}
        <TextInput
          style={styles.input}
          multiline autoFocus
          placeholder="此刻有什么想法……"
          placeholderTextColor="#C0BDB5"
          value={content} onChangeText={setContent}
          textAlignVertical="top"
        />
        {images.length > 0 && (
          <View style={styles.imageRow}>
            {images.map((uri) => (
              <View key={uri} style={styles.imageThumb}>
                <Image source={{ uri }} style={styles.thumbImg} />
                <TouchableOpacity style={styles.removeImg} onPress={() => setImages((p) => p.filter((u) => u !== uri))}>
                  <Ionicons name="close-circle" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        {location && (
          <View style={styles.locationChip}>
            <Ionicons name="location" size={13} color="#534AB7" />
            <Text style={styles.locationText} numberOfLines={1}>{location.name}</Text>
            <TouchableOpacity onPress={() => setLocation(null)}>
              <Ionicons name="close" size={14} color="#888" />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.tagSelector}>
          {PRESET_TAGS.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <TouchableOpacity key={tag} style={[styles.tagPill, active && styles.tagPillActive]} onPress={() => toggleTag(tag)} activeOpacity={0.75}>
                <Text style={[styles.tagPillText, active && styles.tagPillTextActive]}>{tag}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.toolbar}>
        <View style={styles.toolLeft}>
          <TouchableOpacity style={styles.toolBtn} onPress={isRecording ? stopRecording : startRecording} activeOpacity={0.7}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <Ionicons name={isRecording ? 'stop-circle' : 'mic-outline'} size={24} color={isRecording ? '#E53935' : '#534AB7'} />
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={pickImage} activeOpacity={0.7}>
            <Ionicons name="image-outline" size={24} color="#534AB7" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={getLocation} disabled={gettingLocation} activeOpacity={0.7}>
            <Ionicons name={location ? 'location' : 'location-outline'} size={24} color={gettingLocation ? '#C5C3D9' : '#534AB7'} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, !content.trim() && styles.saveBtnDisabled]}
          onPress={handleSave} disabled={!content.trim() || saving} activeOpacity={0.8}
        >
          <Text style={styles.saveBtnText}>{saving ? '保存中…' : '保存'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── 语音备忘模式 ───────────────────────────────────────────────────────────────

function VoiceModeScreen() {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'done'>('idle');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const { addThought } = useStore();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startPulse() {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();
  }
  function stopPulse() { pulseLoop.current?.stop(); pulseAnim.setValue(1); }

  async function startRecording() {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { Alert.alert('需要麦克风权限'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(rec); setPhase('recording'); setDuration(0);
      startPulse();
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch { Alert.alert('无法开始录音'); }
  }

  async function stopRecording() {
    if (!recording) return;
    clearInterval(timerRef.current!);
    stopPulse();
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      setAudioUri(uri ?? null);
      setPhase('done');
    } catch { Alert.alert('停止录音失败'); setPhase('idle'); }
  }

  function redo() { setAudioUri(null); setDuration(0); setPhase('idle'); }

  async function handleSave() {
    if (!audioUri) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', { uri: audioUri, name: 'audio.m4a', type: 'audio/m4a' } as unknown as Blob);
      formData.append('location', location ? JSON.stringify(location) : '');
      formData.append('tags', selectedTags.join(','));
      formData.append('local_audio_uri', audioUri);

      const res = await api.post('/api/thoughts/voice', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      addThought({ ...res.data, audio: audioUri, tags: selectedTags.join(',') || res.data.tags });
      setPhase('idle'); setAudioUri(null); setDuration(0); setSelectedTags([]); setLocation(null);
      router.replace('/(tabs)/');
    } catch { Alert.alert('保存失败，请检查网络'); }
    finally { setSaving(false); }
  }

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <View style={styles.voiceContainer}>
      {/* 录音状态区 */}
      <View style={styles.voiceCenter}>
        {phase === 'idle' && (
          <>
            <TouchableOpacity style={styles.bigMicBtn} onPress={startRecording} activeOpacity={0.8}>
              <Ionicons name="mic" size={44} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.voiceHint}>点击开始录音</Text>
          </>
        )}

        {phase === 'recording' && (
          <>
            <TouchableOpacity style={styles.bigMicBtnActive} onPress={stopRecording} activeOpacity={0.8}>
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <View style={styles.stopIcon} />
              </Animated.View>
            </TouchableOpacity>
            <Text style={styles.voiceDuration}>{fmt(duration)}</Text>
            <Text style={styles.voiceHint}>点击停止录音</Text>
          </>
        )}

        {phase === 'done' && (
          <>
            <View style={styles.doneIcon}>
              <Ionicons name="checkmark" size={44} color="#534AB7" />
            </View>
            <Text style={styles.voiceDuration}>{fmt(duration)}</Text>
            <Text style={styles.voiceHint}>录音完成，后台将自动转文字</Text>
          </>
        )}
      </View>

      {/* 标签（done 状态下显示） */}
      {phase === 'done' && (
        <View style={styles.tagSelector}>
          {PRESET_TAGS.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <TouchableOpacity key={tag} style={[styles.tagPill, active && styles.tagPillActive]} onPress={() => setSelectedTags((p) => p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag])} activeOpacity={0.75}>
                <Text style={[styles.tagPillText, active && styles.tagPillTextActive]}>{tag}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* 操作按钮 */}
      {phase === 'done' && (
        <View style={styles.voiceActions}>
          <TouchableOpacity style={styles.redoBtn} onPress={redo} activeOpacity={0.8}>
            <Ionicons name="refresh" size={18} color="#534AB7" />
            <Text style={styles.redoBtnText}>重录</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, styles.saveBtnWide, saving && styles.saveBtnDisabled]}
            onPress={handleSave} disabled={saving} activeOpacity={0.8}
          >
            <Text style={styles.saveBtnText}>{saving ? '保存中…' : '保存语音随想'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  flex: { flex: 1 },
  modeBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#F0EFF8',
    borderRadius: 10,
    padding: 3,
  },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8 },
  modeBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  modeBtnText: { fontSize: 14, color: '#999' },
  modeBtnTextActive: { color: '#534AB7', fontWeight: '600' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  title: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  count: { fontSize: 13, color: '#aaa' },
  scroll: { flex: 1 },
  clipboardBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#EEEDFE',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  clipboardPreview: { flex: 1, fontSize: 12, color: '#534AB7' },
  clipboardImportBtn: {
    backgroundColor: '#534AB7',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  clipboardImportText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  input: { minHeight: 160, paddingHorizontal: 16, paddingTop: 4, fontSize: 15, color: '#1a1a1a', lineHeight: 24 },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  imageThumb: { position: 'relative', width: 80, height: 80 },
  thumbImg: { width: 80, height: 80, borderRadius: 8 },
  removeImg: { position: 'absolute', top: -6, right: -6 },
  locationChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginHorizontal: 16, marginBottom: 10, backgroundColor: '#EEEDFE', alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  locationText: { fontSize: 12, color: '#534AB7', maxWidth: 200 },
  tagSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  tagPill: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: '#D0CEE8', backgroundColor: '#F8F7FF' },
  tagPillActive: { backgroundColor: '#534AB7', borderColor: '#534AB7' },
  tagPillText: { fontSize: 13, color: '#666' },
  tagPillTextActive: { color: '#fff', fontWeight: '500' },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: '#E8E6E0', backgroundColor: '#fff' },
  toolLeft: { flexDirection: 'row', gap: 4 },
  toolBtn: { padding: 8 },
  saveBtn: { backgroundColor: '#534AB7', borderRadius: 10, paddingHorizontal: 28, paddingVertical: 10 },
  saveBtnWide: { flex: 1, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#C5C3D9' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  // 语音模式
  voiceContainer: { flex: 1, paddingHorizontal: 16, paddingBottom: 16 },
  voiceCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  bigMicBtn: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#534AB7', alignItems: 'center', justifyContent: 'center', shadowColor: '#534AB7', shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  bigMicBtnActive: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center', shadowColor: '#E53935', shadowOpacity: 0.35, shadowRadius: 14, elevation: 6 },
  stopIcon: { width: 28, height: 28, borderRadius: 4, backgroundColor: '#fff' },
  doneIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#EEEDFE', alignItems: 'center', justifyContent: 'center' },
  voiceDuration: { fontSize: 36, fontWeight: '300', color: '#1a1a1a', letterSpacing: 2 },
  voiceHint: { fontSize: 14, color: '#aaa' },
  voiceActions: { flexDirection: 'row', gap: 10, paddingTop: 8 },
  redoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#534AB7', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11 },
  redoBtnText: { fontSize: 15, color: '#534AB7', fontWeight: '500' },
});
