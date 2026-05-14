import { useColorScheme } from 'react-native';
import { Colors, ColorScheme } from '@/constants/Colors';

export function useTheme(): { dark: boolean; colors: ColorScheme } {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  return { dark, colors: dark ? Colors.dark : Colors.light };
}
