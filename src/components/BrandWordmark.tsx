import { Image, ImageSourcePropType, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { useAppPreferences } from '@/services/preferences/AppPreferencesContext';

type BrandWordmarkProps = {
  style?: StyleProp<ViewStyle>;
};

const WORDMARK_LIGHT = require('../../assets/nura-wordmark-light.png') as ImageSourcePropType;
const WORDMARK_DARK = require('../../assets/nura-wordmark-dark.png') as ImageSourcePropType;
const WORDMARK_ASPECT_RATIO = 2762 / 1432;

export function BrandWordmark({ style }: BrandWordmarkProps): React.JSX.Element {
  const { preferences } = useAppPreferences();
  const source = preferences.themeMode === 'dark' ? WORDMARK_DARK : WORDMARK_LIGHT;

  return (
    <View style={[styles.container, style]}>
      <Image source={source} style={styles.image} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'flex-start'
  },
  image: {
    height: 52,
    width: 52 * WORDMARK_ASPECT_RATIO
  }
});
