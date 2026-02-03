// Mock data for IFIT Club app development

import { Activity, User, LeaderboardEntry, Challenge, WeatherData } from '../types';

// Helper to create dates relative to today
const daysAgo = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

// Current user profile
export const currentUser: User = {
  id: 'current',
  name: 'Sugumar J',
  location: 'Chennai, India',
  bio: 'Fitness enthusiast | Running towards my goals',
  joinedDate: new Date('2024-06-15'),
  stats: {
    totalDistance: 245.8,
    totalActivities: 48,
    totalHours: 32.5,
    totalCalories: 15420,
    weeklyDistance: 18.5,
    monthlyDistance: 72.3,
  },
};

// Sample activities
export const mockActivities: Activity[] = [
  {
    id: '1',
    type: 'run',
    title: 'Morning Run',
    date: daysAgo(0),
    distance: 5.2,
    duration: 1680, // 28 min
    pace: 323,
    calories: 320,
    elevation: 45,
  },
  {
    id: '2',
    type: 'ride',
    title: 'Evening Cycling',
    date: daysAgo(1),
    distance: 15.8,
    duration: 2700, // 45 min
    pace: 171,
    calories: 480,
    elevation: 120,
  },
  {
    id: '3',
    type: 'walk',
    title: 'Park Walk',
    date: daysAgo(1),
    distance: 3.2,
    duration: 2400, // 40 min
    pace: 750,
    calories: 180,
    elevation: 15,
  },
  {
    id: '4',
    type: 'run',
    title: 'Beach Run',
    date: daysAgo(2),
    distance: 8.1,
    duration: 2820, // 47 min
    pace: 348,
    calories: 520,
    elevation: 25,
  },
  {
    id: '5',
    type: 'run',
    title: 'Interval Training',
    date: daysAgo(3),
    distance: 4.5,
    duration: 1500, // 25 min
    pace: 333,
    calories: 310,
    elevation: 30,
  },
  {
    id: '6',
    type: 'ride',
    title: 'City Tour',
    date: daysAgo(4),
    distance: 22.3,
    duration: 3600, // 60 min
    pace: 161,
    calories: 650,
    elevation: 180,
  },
  {
    id: '7',
    type: 'walk',
    title: 'Evening Stroll',
    date: daysAgo(5),
    distance: 2.8,
    duration: 2100, // 35 min
    pace: 750,
    calories: 150,
    elevation: 10,
  },
  {
    id: '8',
    type: 'run',
    title: 'Trail Run',
    date: daysAgo(6),
    distance: 6.7,
    duration: 2520, // 42 min
    pace: 376,
    calories: 450,
    elevation: 85,
  },
  {
    id: '9',
    type: 'run',
    title: 'Recovery Jog',
    date: daysAgo(7),
    distance: 3.0,
    duration: 1200, // 20 min
    pace: 400,
    calories: 180,
    elevation: 5,
  },
  {
    id: '10',
    type: 'ride',
    title: 'Weekend Ride',
    date: daysAgo(8),
    distance: 35.2,
    duration: 5400, // 90 min
    pace: 153,
    calories: 920,
    elevation: 250,
  },
];

// Leaderboard data
export const mockLeaderboard: LeaderboardEntry[] = [
  {
    rank: 1,
    user: { id: '101', name: 'Raj Kumar', avatar: undefined },
    stats: { distance: 125.5, activities: 28 },
  },
  {
    rank: 2,
    user: { id: '102', name: 'Priya S', avatar: undefined },
    stats: { distance: 112.3, activities: 24 },
  },
  {
    rank: 3,
    user: { id: '103', name: 'Vijay M', avatar: undefined },
    stats: { distance: 98.7, activities: 22 },
  },
  {
    rank: 4,
    user: { id: 'current', name: 'Sugumar J', avatar: undefined },
    stats: { distance: 72.3, activities: 18 },
    isCurrentUser: true,
  },
  {
    rank: 5,
    user: { id: '105', name: 'Anita R', avatar: undefined },
    stats: { distance: 68.9, activities: 16 },
  },
  {
    rank: 6,
    user: { id: '106', name: 'Karthik N', avatar: undefined },
    stats: { distance: 62.4, activities: 15 },
  },
  {
    rank: 7,
    user: { id: '107', name: 'Deepa K', avatar: undefined },
    stats: { distance: 58.1, activities: 14 },
  },
  {
    rank: 8,
    user: { id: '108', name: 'Arun P', avatar: undefined },
    stats: { distance: 52.8, activities: 13 },
  },
  {
    rank: 9,
    user: { id: '109', name: 'Meena S', avatar: undefined },
    stats: { distance: 48.5, activities: 12 },
  },
  {
    rank: 10,
    user: { id: '110', name: 'Ravi T', avatar: undefined },
    stats: { distance: 45.2, activities: 11 },
  },
  {
    rank: 11,
    user: { id: '111', name: 'Sanjay V', avatar: undefined },
    stats: { distance: 42.1, activities: 10 },
  },
  {
    rank: 12,
    user: { id: '112', name: 'Lakshmi R', avatar: undefined },
    stats: { distance: 38.9, activities: 9 },
  },
  {
    rank: 13,
    user: { id: '113', name: 'Kumar S', avatar: undefined },
    stats: { distance: 35.4, activities: 8 },
  },
  {
    rank: 14,
    user: { id: '114', name: 'Geetha M', avatar: undefined },
    stats: { distance: 32.1, activities: 7 },
  },
  {
    rank: 15,
    user: { id: '115', name: 'Mohan K', avatar: undefined },
    stats: { distance: 28.6, activities: 6 },
  },
];

// Challenges data
export const mockChallenges: Challenge[] = [
  {
    id: '1',
    title: '100km February',
    description: 'Run or walk 100km this month to earn the February Champion badge',
    type: 'distance',
    target: 100,
    progress: 72,
    currentValue: 72.3,
    daysRemaining: 26,
    participants: 1250,
    isActive: true,
    badge: { icon: 'medal', color: '#FFD700' },
  },
  {
    id: '2',
    title: '7-Day Streak',
    description: 'Complete an activity every day for 7 consecutive days',
    type: 'streak',
    target: 7,
    progress: 57,
    currentValue: 4,
    daysRemaining: 3,
    participants: 856,
    isActive: true,
    badge: { icon: 'fire', color: '#FF5722' },
  },
  {
    id: '3',
    title: 'Weekend Warrior',
    description: 'Complete 5 activities on weekends this month',
    type: 'activities',
    target: 5,
    progress: 60,
    currentValue: 3,
    daysRemaining: 26,
    participants: 2340,
    isActive: true,
    badge: { icon: 'sword-cross', color: '#9C27B0' },
  },
  {
    id: '4',
    title: 'Marathon Prep',
    description: 'Run a total of 200km to prepare for marathon season',
    type: 'distance',
    target: 200,
    progress: 35,
    currentValue: 70,
    daysRemaining: 45,
    participants: 678,
    isActive: false,
    badge: { icon: 'trophy', color: '#4285F4' },
  },
  {
    id: '5',
    title: 'Early Bird',
    description: 'Complete 10 activities before 7 AM',
    type: 'activities',
    target: 10,
    progress: 40,
    currentValue: 4,
    daysRemaining: 30,
    participants: 1520,
    isActive: false,
    badge: { icon: 'weather-sunny', color: '#FF9800' },
  },
];

// Weather data (mock)
export const mockWeather: WeatherData = {
  temperature: 28,
  condition: 'sunny',
  humidity: 65,
  windSpeed: 12,
};

// Helper functions
export const getActivityIcon = (type: Activity['type']): string => {
  switch (type) {
    case 'run':
      return 'run';
    case 'ride':
      return 'bike';
    case 'walk':
      return 'walk';
    default:
      return 'run';
  }
};

export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

export const formatPace = (secondsPerKm: number): string => {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.floor(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')} /km`;
};

export const formatDistance = (km: number): string => {
  return km.toFixed(1);
};

export const formatDate = (date: Date): string => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};
