// TypeScript types for IFIT Club app

export type ActivityType = 'run' | 'ride' | 'walk';

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  date: Date;
  distance: number; // in km
  duration: number; // in seconds
  pace?: number; // seconds per km
  calories?: number;
  elevation?: number; // in meters
  route?: { latitude: number; longitude: number }[];
}

export interface User {
  id: string;
  name: string;
  avatar?: string;
  location?: string;
  bio?: string;
  joinedDate: Date;
  stats: UserStats;
}

export interface UserStats {
  totalDistance: number; // km
  totalActivities: number;
  totalHours: number;
  totalCalories: number;
  weeklyDistance: number;
  monthlyDistance: number;
}

export interface LeaderboardEntry {
  rank: number;
  user: {
    id: string;
    name: string;
    avatar?: string;
  };
  stats: {
    distance: number;
    activities: number;
  };
  isCurrentUser?: boolean;
}

export type LeaderboardPeriod = 'weekly' | 'monthly' | 'allTime';

export interface Challenge {
  id: string;
  title: string;
  description: string;
  type: 'distance' | 'activities' | 'streak';
  target: number;
  progress: number; // 0-100
  currentValue: number;
  daysRemaining: number;
  participants: number;
  isActive: boolean;
  badge?: {
    icon: string;
    color: string;
  };
}

export interface WeatherData {
  temperature: number;
  condition: 'sunny' | 'cloudy' | 'rainy' | 'windy';
  humidity: number;
  windSpeed: number;
}
