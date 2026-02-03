import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Image,
  Platform,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { colors } from '../constants/colors';
import { spacing, borderRadius } from '../constants/spacing';
import { mockLeaderboard, formatDistance } from '../constants/mockData';
import { LeaderboardScreenProps } from '../navigation/types';

export default function LeaderboardScreen({ }: LeaderboardScreenProps) {
  const [period, setPeriod] = useState('Weekly');
  const topThree = mockLeaderboard.slice(0, 3);
  const rest = mockLeaderboard.slice(3);

  const renderPodium = () => (
    <View style={styles.podiumContainer}>
      {/* 2nd Place */}
      <View style={styles.podiumItem}>
        <View style={[styles.podiumAvatar, { borderColor: colors.silver }]}>
           <Text style={styles.avatarText}>{topThree[1].user.name[0]}</Text>
        </View>
        <Text style={styles.podiumName}>{topThree[1].user.name.split(' ')[0]}</Text>
        <Text style={styles.podiumValue}>{formatDistance(topThree[1].stats.distance)}</Text>
        <View style={[styles.podiumRank, { backgroundColor: colors.silver, height: 70 }]}>
          <Text style={styles.rankNumber}>2</Text>
        </View>
      </View>
      
      {/* 1st Place */}
      <View style={[styles.podiumItem, { marginHorizontal: 12, marginBottom: 20 }]}>
        <MaterialCommunityIcons name="crown" size={28} color={colors.gold} style={{ marginBottom: 8 }} />
        <View style={[styles.podiumAvatar, { borderColor: colors.gold, width: 80, height: 80, borderRadius: 40 }]}>
           <Text style={[styles.avatarText, { fontSize: 28 }]}>{topThree[0].user.name[0]}</Text>
        </View>
        <Text style={[styles.podiumName, { fontWeight: '700', fontSize: 14 }]}>{topThree[0].user.name.split(' ')[0]}</Text>
        <Text style={styles.podiumValue}>{formatDistance(topThree[0].stats.distance)}</Text>
        <View style={[styles.podiumRank, { backgroundColor: colors.gold, height: 100 }]}>
          <Text style={styles.rankNumber}>1</Text>
        </View>
      </View>

      {/* 3rd Place */}
      <View style={styles.podiumItem}>
        <View style={[styles.podiumAvatar, { borderColor: colors.bronze }]}>
           <Text style={styles.avatarText}>{topThree[2].user.name[0]}</Text>
        </View>
        <Text style={styles.podiumName}>{topThree[2].user.name.split(' ')[0]}</Text>
        <Text style={styles.podiumValue}>{formatDistance(topThree[2].stats.distance)}</Text>
        <View style={[styles.podiumRank, { backgroundColor: colors.bronze, height: 50 }]}>
          <Text style={styles.rankNumber}>3</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Leaderboard</Text>
        <View style={styles.periodSelector}>
          {['Weekly', 'Monthly'].map((p) => (
            <TouchableOpacity 
              key={p} 
              style={[styles.periodTab, period === p && styles.activePeriodTab]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodText, period === p && styles.activePeriodText]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={rest}
        ListHeaderComponent={renderPodium}
        keyExtractor={(item) => item.user.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={[styles.rankRow, item.isCurrentUser && styles.currentUserRow]}>
            <Text style={styles.rankIndex}>{item.rank}</Text>
            <View style={styles.listAvatar}>
              <Text style={styles.listAvatarText}>{item.user.name[0]}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{item.user.name} {item.isCurrentUser && '(You)'}</Text>
              <Text style={styles.userStats}>{item.stats.activities} activities</Text>
            </View>
            <Text style={styles.distanceText}>{formatDistance(item.stats.distance)} km</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FE',
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'android' ? 50 : 20,
    paddingBottom: spacing.md,
    backgroundColor: '#F4F7FE',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.lg,
    letterSpacing: -1,
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
  },
  activePeriodTab: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  periodText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  activePeriodText: {
    color: '#fff',
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: spacing.xxxl,
  },
  podiumContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingTop: spacing.xl,
    paddingBottom: 0,
    marginBottom: spacing.lg,
  },
  podiumItem: {
    alignItems: 'center',
    width: 100,
  },
  podiumAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  avatarText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 20,
  },
  podiumName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  podiumValue: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 12,
    fontWeight: '500',
  },
  podiumRank: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  rankNumber: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 24,
    marginTop: 12,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  currentUserRow: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: '#F4F7FE',
  },
  rankIndex: {
    width: 30,
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  listAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  listAvatarText: {
    fontWeight: '700',
    color: colors.text,
    fontSize: 16,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  userStats: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  distanceText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
});
