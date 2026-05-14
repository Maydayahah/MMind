import { api, useStore, VOICE_PLACEHOLDER } from '@/hooks/useApi';
import { useTheme } from '@/hooks/useTheme';
import { ColorScheme } from '@/constants/Colors';
import MarkdownView from '@/components/MarkdownView';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useQuery } from '@tanstack/react-query';
let DocumentPicker: any = null;
try { DocumentPicker = require('expo-document-picker'); } catch {}
// TODO: run `npm install expo-clipboard expo-share-intent` when network is available
let Clipboard = { getStringAsync: async (): Promise<string> => '' };
try { Clipboard = require('expo-clipboard'); } catch {}
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

export default function WriteScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [mode, setMode] = useState<WriteMode>('text');
  const { text: sharedText } = useLocalSearchParams<{ text?: string }>();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.modeBar}>
        <TouchableOpacity style={[styles.modeBtn, mode === 'text' && styles.modeBtnActive]} onPress={() => setMode('text')}>
          <Ionicons name="create-outline" size={16} color={mode === 'text' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.modeBtnText, mode === 'text' && styles.modeBtnTextActive]}>文字</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, mode === 'voice' && styles.modeBtnActive]} onPress={() => setMode('voice')}>
          <Ionicons name="mic-outline" size={16} color={mode === 'voice' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.modeBtnText, mode === 'voice' && styles.modeBtnTextActive]}>语音备忘</Text>
        </TouchableOpacity>
      </View>
      {mode === 'text' ? <TextModeScreen sharedText={sharedText} /> : <VoiceModeScreen />}
    </SafeAreaView>
  );
}

// ── 文字模式 ──────────────────────────────────────────────────────────────────

function TextModeScreen({ sharedText }: { sharedText?: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [content, setContent] = useState('');
  const [clipboardBanner, setClipboardBanner] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [ocrLoading, setOcrLoading] = useState<Set<string>>(new Set());
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [preview, setPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const { addThought } = useStore();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const { data: dailyPrompt } = useQuery<string>({
    queryKey: ['daily-prompt'],
    queryFn: async () => {
      const res = await api.get('/api/prompt/daily');
      return res.data.prompt as string;
    },
    staleTime: 1000 * 60 * 60 * 12,
  });

  useEffect(() => {
    if (sharedText?.trim()) { setContent(sharedText.trim()); setClipboardBanner(null); }
  }, [sharedText]);

  useEffect(() => {
    if (sharedText?.trim()) return;
    Clipboard.getStringAsync().then((text) => { if (text?.trim()) setClipboardBanner(text.trim()); });
  }, []);

  function importClipboard() {
    if (!clipboardBanner) return;
    setContent((prev) => prev.trim() ? `${prev.trim()}\n\n${clipboardBanner}` : clipboardBanner);
    setClipboardBanner(null);
  }

  async function importDocument() {
    if (!DocumentPicker) { Alert.alert('提示', '文档导入功能需要安装 expo-document-picker'); return; }
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/markdown', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const formData = new FormData();
      formData.append('file', { uri: asset.uri, name: asset.name, type: asset.mimeType || 'text/plain' } as unknown as Blob);
      const res = await api.post('/api/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data?.thought) {
        addThought(res.data.thought);
        Alert.alert('导入成功', `已从「${asset.name}」创建新随想`, [
          { text: '查看', onPress: () => router.push(`/thought/${res.data.thought.id}`) },
          { text: '继续写作', style: 'cancel' },
        ]);
      }
    } catch (e: any) {
      Alert.alert('导入失败', e?.response?.data?.detail ?? '请检查文件格式或网络');
    } finally {
      setImporting(false);
    }
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

  async function ocrImage(uri: string) {
    setOcrLoading((prev) => new Set(prev).add(uri));
    try {
      const filename = uri.split('/').pop() || 'image.jpg';
      const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
      const formData = new FormData();
      formData.append('file', { uri, name: filename, type: ext === 'png' ? 'image/png' : 'image/jpeg' } as unknown as Blob);
      const res = await api.post('/api/ocr', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data?.text) setContent((prev) => prev.trim() ? `${prev.trim()}\n\n${res.data.text}` : res.data.text);
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
        if (geo[0]) { const g = geo[0]; name = [g.district, g.city, g.region].filter(Boolean).join(' ') || name; }
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
      router.replace('/(tabs)');
    } catch { Alert.alert('保存失败'); }
    finally { setSaving(false); }
  }

  const showPrompt = !!dailyPrompt && !promptDismissed && !sharedText?.trim() && !content.trim();

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <Text style={styles.title}>写随想</Text>
        <Text style={styles.count}>{content.length} 字</Text>
      </View>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* 每日写作提示 */}
        {showPrompt && (
          <View style={styles.promptCard}>
            <View style={styles.promptTop}>
              <View style={styles.promptTitleRow}>
                <Ionicons name="sparkles-outline" size={13} color={colors.primary} />
                <Text style={styles.promptLabel}>今日写作提示</Text>
              </View>
              <TouchableOpacity onPress={() => setPromptDismissed(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.promptText}>{dailyPrompt}</Text>
            <TouchableOpacity style={styles.promptBtn} onPress={() => { setContent(dailyPrompt!); setPromptDismissed(true); }} activeOpacity={0.8}>
              <Text style={styles.promptBtnText}>用这个写</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 剪贴板导入提示 */}
        {clipboardBanner && (
          <View style={styles.clipboardBanner}>
            <Ionicons name="clipboard-outline" size={14} color={colors.primary} />
            <Text style={styles.clipboardPreview} numberOfLines={1}>{clipboardBanner}</Text>
            <TouchableOpacity onPress={importClipboard} style={styles.clipboardImportBtn}>
              <Text style={styles.clipboardImportText}>导入</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setClipboardBanner(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={14} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
        )}

        {preview ? (
          <View style={styles.previewArea}>
            <MarkdownView content={content || '_（暂无内容）_'} colors={colors} />
          </View>
        ) : (
          <TextInput
            style={styles.input}
            multiline autoFocus
            placeholder="此刻有什么想法……"
            placeholderTextColor={colors.placeholder}
            value={content}
            onChangeText={setContent}
            textAlignVertical="top"
          />
        )}

        {images.length > 0 && (
          <View style={styles.imageRow}>
            {images.map((uri) => (
              <View key={uri} style={styles.imageThumb}>
                <Image source={{ uri }} style={styles.thumbImg} />
                <TouchableOpacity style={styles.removeImg} onPress={() => setImages((p) => p.filter((u) => u !== uri))}>
                  <Ionicons name="close-circle" size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.ocrBtn} onPress={() => ocrImage(uri)} disabled={ocrLoading.has(uri)}>
                  {ocrLoading.has(uri) ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="scan-outline" size={15} color="#fff" />}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {location && (
          <View style={styles.locationChip}>
            <Ionicons name="location" size={13} color={colors.primary} />
            <Text style={styles.locationText} numberOfLines={1}>{location.name}</Text>
            <TouchableOpacity onPress={() => setLocation(null)}>
              <Ionicons name="close" size={14} color={colors.textSecondary} />
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
              <Ionicons name={isRecording ? 'stop-circle' : 'mic-outline'} size={24} color={isRecording ? colors.danger : colors.primary} />
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={pickImage} activeOpacity={0.7}>
            <Ionicons name="image-outline" size={24} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={getLocation} disabled={gettingLocation} activeOpacity={0.7}>
            <Ionicons name={location ? 'location' : 'location-outline'} size={24} color={gettingLocation ? colors.primaryMuted : colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={() => setPreview((v) => !v)} activeOpacity={0.7}>
            <Ionicons name={preview ? 'eye-off-outline' : 'eye-outline'} size={24} color={preview ? colors.primary : colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={importDocument} disabled={importing} activeOpacity={0.7}>
            {importing
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Ionicons name="folder-open-outline" size={24} color={colors.primary} />
            }
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, !content.trim() && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!content.trim() || saving}
          activeOpacity={0.8}
        >
          <Text style={styles.saveBtnText}>{saving ? '保存中…' : '保存'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── 语音备忘模式 ───────────────────────────────────────────────────────────────

function VoiceModeScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
      setRecording(null); setAudioUri(uri ?? null); setPhase('done');
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
      const res = await api.post('/api/thoughts/voice', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      addThought({ ...res.data, audio: audioUri, tags: selectedTags.join(',') || res.data.tags });
      setPhase('idle'); setAudioUri(null); setDuration(0); setSelectedTags([]); setLocation(null);
      router.replace('/(tabs)');
    } catch { Alert.alert('保存失败，请检查网络'); }
    finally { setSaving(false); }
  }

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <View style={styles.voiceContainer}>
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
              <Ionicons name="checkmark" size={44} color={colors.primary} />
            </View>
            <Text style={styles.voiceDuration}>{fmt(duration)}</Text>
            <Text style={styles.voiceHint}>录音完成，后台将自动转文字</Text>
          </>
        )}
      </View>
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
      {phase === 'done' && (
        <View style={styles.voiceActions}>
          <TouchableOpacity style={styles.redoBtn} onPress={redo} activeOpacity={0.8}>
            <Ionicons name="refresh" size={18} color={colors.primary} />
            <Text style={styles.redoBtnText}>重录</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.saveBtn, styles.saveBtnWide, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
            <Text style={styles.saveBtnText}>{saving ? '保存中…' : '保存语音随想'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

function makeStyles(c: ColorScheme) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: c.bg },
    flex: { flex: 1 },
    modeBar: { flexDirection: 'row', marginHorizontal: 16, marginTop: 8, marginBottom: 4, backgroundColor: c.inputBg, borderRadius: 10, padding: 3 },
    modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8 },
    modeBtnActive: { backgroundColor: c.card, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
    modeBtnText: { fontSize: 14, color: c.textSecondary },
    modeBtnTextActive: { color: c.primary, fontWeight: '600' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
    title: { fontSize: 18, fontWeight: '700', color: c.text },
    count: { fontSize: 13, color: c.textTertiary },
    scroll: { flex: 1 },
    // 每日写作提示
    promptCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: c.primaryLight, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.primary + '30' },
    promptTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    promptTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    promptLabel: { fontSize: 12, fontWeight: '600', color: c.primary },
    promptText: { fontSize: 15, color: c.text, lineHeight: 22, marginBottom: 12 },
    promptBtn: { alignSelf: 'flex-start', backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7 },
    promptBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },
    // 剪贴板
    clipboardBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginTop: 8, marginBottom: 4, backgroundColor: c.primaryLight, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
    clipboardPreview: { flex: 1, fontSize: 12, color: c.primary },
    clipboardImportBtn: { backgroundColor: c.primary, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
    clipboardImportText: { fontSize: 12, color: '#fff', fontWeight: '600' },
    // 输入 & 预览
    input: { minHeight: 160, paddingHorizontal: 16, paddingTop: 4, fontSize: 15, color: c.text, lineHeight: 24 },
    previewArea: { minHeight: 160, paddingHorizontal: 16, paddingTop: 4 },
    imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
    imageThumb: { position: 'relative', width: 80, height: 80 },
    thumbImg: { width: 80, height: 80, borderRadius: 8 },
    removeImg: { position: 'absolute', top: -6, right: -6 },
    ocrBtn: { position: 'absolute', bottom: -6, left: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    locationChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginHorizontal: 16, marginBottom: 10, backgroundColor: c.primaryLight, alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
    locationText: { fontSize: 12, color: c.primary, maxWidth: 200 },
    tagSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
    tagPill: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: c.checkboxBorder, backgroundColor: c.cardSelected },
    tagPillActive: { backgroundColor: c.primary, borderColor: c.primary },
    tagPillText: { fontSize: 13, color: c.textSecondary },
    tagPillTextActive: { color: '#fff', fontWeight: '500' },
    // 工具栏
    toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: c.border, backgroundColor: c.card },
    toolLeft: { flexDirection: 'row', gap: 4 },
    toolBtn: { padding: 8 },
    saveBtn: { backgroundColor: c.primary, borderRadius: 10, paddingHorizontal: 28, paddingVertical: 10 },
    saveBtnWide: { flex: 1, alignItems: 'center' },
    saveBtnDisabled: { backgroundColor: c.primaryMuted },
    saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
    // 语音模式
    voiceContainer: { flex: 1, paddingHorizontal: 16, paddingBottom: 16 },
    voiceCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
    bigMicBtn: { width: 100, height: 100, borderRadius: 50, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', shadowColor: c.primary, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
    bigMicBtnActive: { width: 100, height: 100, borderRadius: 50, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center', shadowColor: c.danger, shadowOpacity: 0.35, shadowRadius: 14, elevation: 6 },
    stopIcon: { width: 28, height: 28, borderRadius: 4, backgroundColor: '#fff' },
    doneIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: c.primaryLight, alignItems: 'center', justifyContent: 'center' },
    voiceDuration: { fontSize: 36, fontWeight: '300', color: c.text, letterSpacing: 2 },
    voiceHint: { fontSize: 14, color: c.textTertiary },
    voiceActions: { flexDirection: 'row', gap: 10, paddingTop: 8 },
    redoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: c.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11 },
    redoBtnText: { fontSize: 15, color: c.primary, fontWeight: '500' },
  });
}
