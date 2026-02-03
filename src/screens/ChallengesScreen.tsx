import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { colors } from '../constants/colors';
import { spacing, borderRadius } from '../constants/spacing';
import { mockChallenges } from '../constants/mockData';
import { ChallengesScreenProps } from '../navigation/types';

export default function ChallengesScreen({ }: ChallengesScreenProps) {
  const activeChallenges = mockChallenges.filter(c => c.isActive);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Challenges</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Active Now</Text>
        {activeChallenges.map((challenge) => (
          <TouchableOpacity key={challenge.id} style={styles.challengeCard} activeOpacity={0.8}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconBox, { backgroundColor: challenge.badge?.color + '15' }]}>
                <MaterialCommunityIcons name={challenge.badge?.icon as any} size={28} color={challenge.badge?.color} />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.challengeTitle}>{challenge.title}</Text>
                <Text style={styles.challengeEnds}>Ends in {challenge.daysRemaining} days</Text>
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>Active</Text>
              </View>
            </View>
            
            <Text style={styles.description}>{challenge.description}</Text>
            
            <View style={styles.progressContainer}>
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>Progress</Text>
                <Text style={styles.progressPercent}>{challenge.progress}%</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View 
                  style={[
                    styles.progressBarFill, 
                    { width: `${challenge.progress}%`, backgroundColor: challenge.badge?.color || colors.primary }
                  ]} 
                />
              </View>
              <Text style={styles.progressStats}>
                {challenge.currentValue} / {challenge.target} {challenge.type === 'distance' ? 'km' : 'activities'}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionTitle}>Discover</Text>
        {/* Mock Discover Cards */}
        <View style={styles.discoverCard}>
          <View style={styles.discoverContent}>
            <Text style={styles.discoverTitle}>Monthly 5K</Text>
            <Text style={styles.discoverDesc}>Run 5km every week this month.</Text>
            <TouchableOpacity style={styles.joinButton}>
              <Text style={styles.joinButtonText}>Join Challenge</Text>
            </TouchableOpacity>
          </View>
          <MaterialCommunityIcons name="trophy-outline" size={80} color={colors.primary + '20'} style={styles.discoverIcon} />
        </View>
      </ScrollView>
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
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
    letterSpacing: -0.5,
  },
  challengeCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  challengeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  challengeEnds: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  statusBadge: {
    backgroundColor: colors.success + '15',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.success,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  progressContainer: {
    marginTop: spacing.xs,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  progressPercent: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  progressBarBg: {
    height: 10,
    backgroundColor: '#F4F7FE',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  progressStats: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'right',
    fontWeight: '500',
  },
  discoverCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  discoverContent: {
    flex: 1,
    paddingRight: spacing.md,
    zIndex: 1,
  },
  discoverTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
  },
  discoverDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  joinButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    alignSelf: 'flex-start',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  discoverIcon: {
    position: 'absolute',
    right: -10,
    bottom: -10,
    transform: [{ rotate: '-15deg' }],
  },
});
