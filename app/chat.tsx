import { api } from '@/hooks/useApi';
import { useTheme } from '@/hooks/useTheme';
import { ColorScheme } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Message { role: 'user' | 'assistant'; content: string; }

const WELCOME: Message = {
  role: 'assistant',
  content: '你好！我可以帮你查找和分析你的随想笔记。\n\n试着问我：\n・"我最近关注什么话题？"\n・"帮我找找关于技术的笔记"\n・"上周我记录了什么？"',
};

export default function ChatScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: Message = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    try {
      const history = nextMessages.filter((_, i) => i > 0).map((m) => ({ role: m.role, content: m.content }));
      const res = await api.post('/api/chat', { message: text, history });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: '抱歉，出现了错误，请稍后重试。' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>与笔记对话</Text>
        <View style={{ width: 24 }} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <MessageBubble message={item} colors={colors} styles={styles} />}
          ListFooterComponent={
            loading ? (
              <View style={styles.thinkingRow}>
                <View style={styles.thinkingBubble}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.thinkingText}>正在思考…</Text>
                </View>
              </View>
            ) : null
          }
        />
        <View style={styles.inputArea}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="问问你的笔记…"
            placeholderTextColor={colors.placeholder}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!input.trim() || loading}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({ message, colors, styles }: { message: Message; colors: ColorScheme; styles: ReturnType<typeof makeStyles> }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>✦</Text>
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{message.content}</Text>
      </View>
    </View>
  );
}

function makeStyles(c: ColorScheme) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: c.bg },
    flex: { flex: 1 },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 0.5, borderBottomColor: c.border,
    },
    title: { fontSize: 16, fontWeight: '600', color: c.text },
    list: { flex: 1 },
    listContent: { padding: 16, gap: 12 },
    bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    bubbleRowUser: { flexDirection: 'row-reverse' },
    avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.primaryLight, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    avatarText: { fontSize: 12, color: c.primary },
    bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
    bubbleAI: { backgroundColor: c.card, borderWidth: 0.5, borderColor: c.border, borderBottomLeftRadius: 4 },
    bubbleUser: { backgroundColor: c.primary, borderBottomRightRadius: 4 },
    bubbleText: { fontSize: 15, color: c.text, lineHeight: 22 },
    bubbleTextUser: { color: '#fff' },
    thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 36 },
    thinkingBubble: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.card, borderWidth: 0.5, borderColor: c.border,
      borderRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 10,
    },
    thinkingText: { fontSize: 14, color: c.textTertiary },
    inputArea: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 10,
      paddingHorizontal: 16, paddingVertical: 12,
      borderTopWidth: 0.5, borderTopColor: c.border, backgroundColor: c.card,
    },
    input: {
      flex: 1, backgroundColor: c.inputBg, borderRadius: 20,
      paddingHorizontal: 16, paddingVertical: 10,
      fontSize: 15, color: c.text, maxHeight: 100,
    },
    sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    sendBtnDisabled: { backgroundColor: c.primaryMuted },
  });
}
