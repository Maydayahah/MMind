import { api, saveAuthToken } from '@/hooks/useApi';
import { useTheme } from '@/hooks/useTheme';
import { ColorScheme } from '@/constants/Colors';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Mode = 'login' | 'register';

export default function LoginScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const u = username.trim();
    const p = password.trim();
    if (!u || !p) { Alert.alert('请填写用户名和密码'); return; }
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await api.post(endpoint, { username: u, password: p });
      await saveAuthToken(res.data.token);
      router.replace('/(tabs)');
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? (mode === 'login' ? '登录失败' : '注册失败');
      Alert.alert('提示', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.logoArea}>
          <Text style={styles.logo}>思绪</Text>
          <Text style={styles.tagline}>随手捕捉灵感，AI 帮你整理成文</Text>
        </View>
        <View style={styles.modeBar}>
          {(['login', 'register'] as Mode[]).map((m) => (
            <TouchableOpacity key={m} style={[styles.modeBtn, mode === m && styles.modeBtnActive]} onPress={() => setMode(m)}>
              <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                {m === 'login' ? '登录' : '注册'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="用户名"
            placeholderTextColor={colors.placeholder}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder={mode === 'register' ? '密码（至少6位）' : '密码'}
            placeholderTextColor={colors.placeholder}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.submitBtnText}>
              {loading ? '请稍候…' : mode === 'login' ? '登录' : '注册'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(c: ColorScheme) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: c.bg },
    container: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
    logoArea: { alignItems: 'center', marginBottom: 48 },
    logo: { fontSize: 40, fontWeight: '700', color: c.primary, letterSpacing: 2 },
    tagline: { fontSize: 13, color: c.textTertiary, marginTop: 8 },
    modeBar: { flexDirection: 'row', backgroundColor: c.inputBg, borderRadius: 12, padding: 3, marginBottom: 24 },
    modeBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
    modeBtnActive: { backgroundColor: c.card, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
    modeBtnText: { fontSize: 15, color: c.textSecondary },
    modeBtnTextActive: { color: c.primary, fontWeight: '600' },
    form: { gap: 12 },
    input: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 0.5,
      borderColor: c.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 15,
      color: c.text,
    },
    submitBtn: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
    submitBtnDisabled: { backgroundColor: c.primaryMuted },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  });
}
