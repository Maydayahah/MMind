/**
 * Themed markdown renderer.
 * Requires: npx expo install react-native-markdown-display expo-document-picker
 * Falls back to plain text if the package is not yet installed.
 */
import { ColorScheme } from '@/constants/Colors';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';

// Optional dependency — graceful fallback to plain text if not installed
let Markdown: any = null;
try { Markdown = require('react-native-markdown-display').default; } catch {}

interface Props {
  content: string;
  colors: ColorScheme;
  scrollable?: boolean;
  style?: ViewStyle;
}

export default function MarkdownView({ content, colors, scrollable = false, style }: Props) {
  const mdStyles = useMemo(() => makeMarkdownStyles(colors), [colors]);

  if (!Markdown) {
    // Fallback: plain text rendering until the package is installed
    const inner = (
      <View style={style}>
        <Text style={{ fontSize: 15, color: colors.text, lineHeight: 24 }}>{content}</Text>
      </View>
    );
    return scrollable ? (
      <ScrollView style={style} showsVerticalScrollIndicator={false}>{inner}</ScrollView>
    ) : inner;
  }

  if (scrollable) {
    return (
      <ScrollView style={style} showsVerticalScrollIndicator={false}>
        <Markdown style={mdStyles}>{content}</Markdown>
      </ScrollView>
    );
  }

  return <Markdown style={mdStyles}>{content}</Markdown>;
}

function makeMarkdownStyles(c: ColorScheme) {
  return StyleSheet.create({
    body: { color: c.text, fontSize: 15, lineHeight: 24 },
    heading1: { color: c.text, fontSize: 22, fontWeight: '700', marginTop: 20, marginBottom: 10, borderBottomWidth: 0.5, borderBottomColor: c.border, paddingBottom: 6 },
    heading2: { color: c.text, fontSize: 19, fontWeight: '700', marginTop: 16, marginBottom: 8 },
    heading3: { color: c.text, fontSize: 16, fontWeight: '600', marginTop: 12, marginBottom: 6 },
    heading4: { color: c.text, fontSize: 15, fontWeight: '600', marginTop: 10, marginBottom: 4 },
    paragraph: { color: c.text, fontSize: 15, lineHeight: 24, marginBottom: 10 },
    strong: { color: c.text, fontWeight: '700' },
    em: { color: c.text, fontStyle: 'italic' },
    s: { color: c.textTertiary },
    link: { color: c.primary },
    blockquote: { backgroundColor: c.inputBg, borderLeftColor: c.primary, borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 4, marginVertical: 8, borderRadius: 4 },
    code_inline: { backgroundColor: c.inputBg, color: c.primary, fontFamily: 'monospace', fontSize: 13, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
    fence: { backgroundColor: c.inputBg, borderRadius: 8, padding: 12, marginVertical: 8 },
    code_block: { backgroundColor: c.inputBg, borderRadius: 8, padding: 12, marginVertical: 8, color: c.text, fontFamily: 'monospace', fontSize: 13 },
    bullet_list: { marginBottom: 8 },
    ordered_list: { marginBottom: 8 },
    list_item: { color: c.text, fontSize: 15, lineHeight: 24, flexDirection: 'row', marginBottom: 4 },
    bullet_list_icon: { color: c.primary, marginRight: 8, lineHeight: 24 },
    ordered_list_icon: { color: c.primary, marginRight: 8, lineHeight: 24 },
    hr: { backgroundColor: c.border, height: 0.5, marginVertical: 16 },
    table: { borderWidth: 0.5, borderColor: c.border, borderRadius: 6, marginVertical: 8 },
    thead: { backgroundColor: c.inputBg },
    th: { color: c.text, fontWeight: '600', fontSize: 13, padding: 8 },
    td: { color: c.text, fontSize: 13, padding: 8 },
    tr: { borderBottomWidth: 0.5, borderColor: c.border },
    image: { borderRadius: 8, maxWidth: '100%' },
  } as any);
}
