// Navigation type definitions for IFIT Club app

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

// Tab Navigator param list
export type MainTabParamList = {
  Dashboard: undefined;
  Activities: undefined;
  Leaderboard: undefined;
  Challenges: undefined;
  Profile: undefined;
};

// Root Stack param list (includes tabs and modal screens)
export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  FitnessMap: { activityId?: string } | undefined;
  ActivityDetail: { activityId: string };
  ChallengeDetail: { challengeId: string };
};

// Screen props types for each tab screen
export type DashboardScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Dashboard'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type ActivitiesScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Activities'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type LeaderboardScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Leaderboard'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type ChallengesScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Challenges'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type ProfileScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Profile'>,
  NativeStackScreenProps<RootStackParamList>
>;

// Detail screen props
export type FitnessMapScreenProps = NativeStackScreenProps<RootStackParamList, 'FitnessMap'>;
export type ActivityDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'ActivityDetail'>;
export type ChallengeDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'ChallengeDetail'>;
