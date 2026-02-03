// Spacing scale for consistent layouts

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  round: 9999,
} as const;

export const iconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

export const avatarSize = {
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
} as const;

export type SpacingName = keyof typeof spacing;
