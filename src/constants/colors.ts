// Color palette for IFIT Club app

export const colors = {
  // Primary colors
  primary: '#4285F4',
  primaryLight: '#6BA3F7',
  primaryDark: '#2962FF',

  // Secondary colors
  secondary: '#4CAF50',
  secondaryLight: '#80E27E',
  secondaryDark: '#087F23',

  // Status colors
  success: '#4CAF50',
  error: '#f44336',
  warning: '#FF9800',
  info: '#2196F3',

  // Activity type colors
  run: '#FF5722',
  ride: '#4285F4',
  walk: '#4CAF50',

  // Neutrals
  background: '#F5F5F5',
  surface: '#FFFFFF',
  card: '#FFFFFF',

  // Text colors
  text: '#333333',
  textSecondary: '#666666',
  textMuted: '#999999',
  textLight: '#FFFFFF',

  // Border and divider
  border: '#E0E0E0',
  divider: '#EEEEEE',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',

  // Rank colors
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
} as const;

export type ColorName = keyof typeof colors;
