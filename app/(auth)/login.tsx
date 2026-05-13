import { api, saveAuthToken } from '@/hooks/useApi';
import { router } from 'expo-router';
import { useState } from 'react';
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
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const u = username.trim();
    const p = password.trim();
    if (!u || !p) {
      Alert.alert('请填写用户名和密码');
      return;
    }
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
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Logo 区 */}
        <View style={styles.logoArea}>
          <Text style={styles.logo}>思绪</Text>
          <Text style={styles.tagline}>随手捕捉灵感，AI 帮你整理成文</Text>
        </View>

        {/* 模式切换 */}
        <View style={styles.modeBar}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'login' && styles.modeBtnActive]}
            onPress={() => setMode('login')}
          >
            <Text style={[styles.modeBtnText, mode === 'login' && styles.modeBtnTextActive]}>登录</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'register' && styles.modeBtnActive]}
            onPress={() => setMode('register')}
          >
            <Text style={[styles.modeBtnText, mode === 'register' && styles.modeBtnTextActive]}>注册</Text>
          </TouchableOpacity>
        </View>

        {/* 表单 */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="用户名"
            placeholderTextColor="#C0BDB5"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder={mode === 'register' ? '密码（至少6位）' : '密码'}
            placeholderTextColor="#C0BDB5"
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  logoArea: { alignItems: 'center', marginBottom: 48 },
  logo: { fontSize: 40, fontWeight: '700', color: '#534AB7', letterSpacing: 2 },
  tagline: { fontSize: 13, color: '#aaa', marginTop: 8 },
  modeBar: {
    flexDirection: 'row',
    backgroundColor: '#F0EFF8',
    borderRadius: 12,
    padding: 3,
    marginBottom: 24,
  },
  modeBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  modeBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  modeBtnText: { fontSize: 15, color: '#999' },
  modeBtnTextActive: { color: '#534AB7', fontWeight: '600' },
  form: { gap: 12 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#E8E6E0',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1a1a1a',
  },
  submitBtn: {
    backgroundColor: '#534AB7',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnDisabled: { backgroundColor: '#C5C3D9' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
