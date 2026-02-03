// Bottom Tab Navigator for IFIT Club app

import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { MainTabParamList } from './types';
import { colors } from '../constants/colors';

// Import screens
import DashboardScreen from '../screens/DashboardScreen';
import ActivitiesScreen from '../screens/ActivitiesScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import ChallengesScreen from '../screens/ChallengesScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

type TabIconProps = {
  focused: boolean;
  color: string;
  size: number;
};

const getTabIcon = (routeName: keyof MainTabParamList) => {
  return ({ focused, color, size }: TabIconProps) => {
    let iconName: string;

    switch (routeName) {
      case 'Dashboard':
        iconName = focused ? 'home' : 'home-outline';
        break;
      case 'Activities':
        iconName = focused ? 'run' : 'run';
        break;
      case 'Leaderboard':
        iconName = focused ? 'trophy' : 'trophy-outline';
        break;
      case 'Challenges':
        iconName = focused ? 'flag-checkered' : 'flag-outline';
        break;
      case 'Profile':
        iconName = focused ? 'account' : 'account-outline';
        break;
      default:
        iconName = 'circle';
    }

    return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
  };
};

export default function TabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarIconStyle: styles.tabBarIcon,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: getTabIcon('Dashboard'),
        }}
      />
      <Tab.Screen
        name="Activities"
        component={ActivitiesScreen}
        options={{
          tabBarLabel: 'Activities',
          tabBarIcon: getTabIcon('Activities'),
        }}
      />
      <Tab.Screen
        name="Leaderboard"
        component={LeaderboardScreen}
        options={{
          tabBarLabel: 'Leaderboard',
          tabBarIcon: getTabIcon('Leaderboard'),
        }}
      />
      <Tab.Screen
        name="Challenges"
        component={ChallengesScreen}
        options={{
          tabBarLabel: 'Challenges',
          tabBarIcon: getTabIcon('Challenges'),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: getTabIcon('Profile'),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    height: Platform.OS === 'ios' ? 85 : 65,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 28 : 10,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  tabBarIcon: {
    marginBottom: -2,
  },
});
