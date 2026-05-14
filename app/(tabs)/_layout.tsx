import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color }: { name: IconName; color: string }) {
  return <Ionicons name={name} size={22} color={color} />;
}

export default function TabLayout() {
  const dark = useColorScheme() === 'dark';
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: dark ? '#7C73D4' : '#534AB7',
        tabBarInactiveTintColor: dark ? '#636366' : '#9E9E9E',
        tabBarStyle: {
          borderTopWidth: 0.5,
          borderTopColor: dark ? '#38383A' : '#E8E6E0',
          backgroundColor: dark ? '#1C1C1E' : '#FFFFFF',
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '时间流',
          tabBarIcon: ({ color }) => <TabIcon name="time-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="write"
        options={{
          title: '写随想',
          tabBarIcon: ({ color }) => <TabIcon name="create-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="collections"
        options={{
          title: '文集',
          tabBarIcon: ({ color }) => <TabIcon name="book-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: '洞察',
          tabBarIcon: ({ color }) => <TabIcon name="bar-chart-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: '地点',
          tabBarIcon: ({ color }) => <TabIcon name="location-outline" color={color} />,
        }}
      />
    </Tabs>
  );
}
