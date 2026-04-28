import { api, Thought, useStore } from '@/hooks/useApi';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface LocationData {
  lat: number;
  lng: number;
  name: string;
}

function parseLocation(raw: string): LocationData | null {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function parseImages(raw: string): string[] {
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

export default function MapScreen() {
  const { thoughts, setThoughts } = useStore();

  useQuery({
    queryKey: ['thoughts'],
    queryFn: async () => {
      const res = await api.get('/api/thoughts');
      setThoughts(res.data);
      return res.data as Thought[];
    },
    staleTime: 60_000,
  });

  // 按地点分组
  const groups: Record<string, Thought[]> = {};
  const noLocation: Thought[] = [];

  for (const t of thoughts) {
    const loc = parseLocation(t.location);
    if (loc?.name) {
      if (!groups[loc.name]) groups[loc.name] = [];
      groups[loc.name].push(t);
    } else {
      noLocation.push(t);
    }
  }

  const locationEntries = Object.entries(groups).sort(([, a], [, b]) => b.length - a.length);
  const hasAny = locationEntries.length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>地点</Text>
        <Text style={styles.subtitle}>{locationEntries.length} 个地点</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {!hasAny && (
          <View style={styles.empty}>
            <Ionicons name="location-outline" size={44} color="#D0CFC8" />
            <Text style={styles.emptyText}>还没有带地点的随想</Text>
            <Text style={styles.emptyHint}>在「写随想」页面点击位置图标添加地点</Text>
          </View>
        )}

        {locationEntries.map(([name, items]) => (
          <LocationGroup key={name} name={name} thoughts={items} />
        ))}

        {noLocation.length > 0 && (
          <LocationGroup name="未标记地点" thoughts={noLocation} muted />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function LocationGroup({
  name,
  thoughts,
  muted = false,
}: {
  name: string;
  thoughts: Thought[];
  muted?: boolean;
}) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Ionicons name="location" size={14} color={muted ? '#aaa' : '#534AB7'} />
        <Text style={[styles.groupName, muted && styles.groupNameMuted]}>{name}</Text>
        <View style={styles.groupBadge}>
          <Text style={styles.groupBadgeText}>{thoughts.length}</Text>
        </View>
      </View>

      {thoughts.map((t) => (
        <LocationThoughtCard key={t.id} thought={t} />
      ))}
    </View>
  );
}

function LocationThoughtCard({ thought }: { thought: Thought }) {
  const imgs = parseImages(thought.images);
  const tags = thought.tags ? thought.tags.split(',').filter(Boolean) : [];

  return (
    <TouchableOpacity activeOpacity={0.85} style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTime}>{dayjs(thought.created_at).format('MM-DD HH:mm')}</Text>
      </View>
      <Text style={styles.cardContent} numberOfLines={3}>{thought.content}</Text>
      {imgs.length > 0 && (
        <View style={styles.imgRow}>
          {imgs.slice(0, 4).map((uri, i) => (
            <Image key={i} source={{ uri }} style={styles.imgThumb} />
          ))}
          {imgs.length > 4 && (
            <View style={styles.imgMore}>
              <Text style={styles.imgMoreText}>+{imgs.length - 4}</Text>
            </View>
          )}
        </View>
      )}
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  subtitle: { fontSize: 13, color: '#aaa' },
  scroll: { flex: 1, paddingHorizontal: 16 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyText: { fontSize: 16, color: '#aaa', fontWeight: '500' },
  emptyHint: { fontSize: 13, color: '#C0BDB5', textAlign: 'center', paddingHorizontal: 40 },
  group: { marginBottom: 20 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingVertical: 4,
  },
  groupName: { fontSize: 14, fontWeight: '600', color: '#534AB7', flex: 1 },
  groupNameMuted: { color: '#aaa' },
  groupBadge: {
    backgroundColor: '#EEEDFE',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  groupBadgeText: { fontSize: 11, color: '#534AB7', fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: '#E8E6E0',
  },
  cardTop: { marginBottom: 4 },
  cardTime: { fontSize: 11, color: '#aaa' },
  cardContent: { fontSize: 14, color: '#1a1a1a', lineHeight: 21 },
  imgRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  imgThumb: { width: 60, height: 60, borderRadius: 6 },
  imgMore: { width: 60, height: 60, borderRadius: 6, backgroundColor: '#E8E6E0', alignItems: 'center', justifyContent: 'center' },
  imgMoreText: { fontSize: 13, color: '#666', fontWeight: '600' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: { backgroundColor: '#EEEDFE', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, color: '#3C3489' },
});
