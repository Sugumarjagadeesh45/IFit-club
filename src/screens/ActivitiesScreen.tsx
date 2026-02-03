import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Modal,
  Platform,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { colors } from '../constants/colors';
import { spacing, borderRadius } from '../constants/spacing';
import { mockActivities, formatDate, formatDistance, formatDuration, getActivityIcon } from '../constants/mockData';
import { ActivitiesScreenProps } from '../navigation/types';

const { width } = Dimensions.get('window');

// Custom Calendar Component
const CalendarView = () => {
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
  
  const calendarDays = Array.from({ length: 35 }, (_, i) => {
    const dayNum = i - firstDay + 1;
    return dayNum > 0 && dayNum <= daysInMonth ? dayNum : null;
  });

  return (
    <View style={styles.calendarContainer}>
      <View style={styles.calendarHeader}>
        <Text style={styles.monthTitle}>
          {today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Text>
        <View style={styles.calendarNav}>
          <TouchableOpacity style={styles.navButton}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton}>
            <MaterialCommunityIcons name="chevron-right" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.weekRow}>
        {days.map((d, i) => (
          <Text key={i} style={styles.weekDayText}>{d}</Text>
        ))}
      </View>
      
      <View style={styles.daysGrid}>
        {calendarDays.map((day, i) => (
          <View key={i} style={[
            styles.dayCell,
            day === today.getDate() && styles.todayCell
          ]}>
            {day && (
              <Text style={[
                styles.dayText,
                day === today.getDate() && styles.todayText
              ]}>{day}</Text>
            )}
            {day && day % 3 === 0 && ( // Mock activity dot
              <View style={styles.activityDot} />
            )}
          </View>
        ))}
      </View>
    </View>
  );
};

export default function ActivitiesScreen({ navigation }: ActivitiesScreenProps) {
  const [activeTab, setActiveTab] = useState<'individual' | 'group'>('individual');
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Activities</Text>
        <TouchableOpacity style={styles.filterButton}>
          <MaterialCommunityIcons name="filter-variant" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'individual' && styles.activeTab]}
          onPress={() => setActiveTab('individual')}
        >
          <Text style={[styles.tabText, activeTab === 'individual' && styles.activeTabText]}>Individual</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'group' && styles.activeTab]}
          onPress={() => setActiveTab('group')}
        >
          <Text style={[styles.tabText, activeTab === 'group' && styles.activeTabText]}>Group</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={mockActivities}
        ListHeaderComponent={<CalendarView />}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.activityCard}>
            <View style={[styles.iconContainer, { backgroundColor: colors[item.type] + '15' }]}>
              <MaterialCommunityIcons name={getActivityIcon(item.type)} size={24} color={colors[item.type]} />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>{formatDate(item.date)} • {formatDuration(item.duration)}</Text>
            </View>
            <Text style={styles.cardValue}>{formatDistance(item.distance)} km</Text>
          </TouchableOpacity>
        )}
      />

      {/* Set Activity FAB */}
      <TouchableOpacity 
        style={styles.fab}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons name="plus" size={32} color="#fff" />
      </TouchableOpacity>

      {/* Simple Modal for "Set Activity" */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Log Activity</Text>
            <TouchableOpacity style={styles.modalOption} onPress={() => setModalVisible(false)}>
              <View style={[styles.modalIcon, { backgroundColor: colors.primary + '15' }]}>
                <MaterialCommunityIcons name="run" size={24} color={colors.primary} />
              </View>
              <Text style={styles.modalOptionText}>Run</Text>
              <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textSecondary} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => setModalVisible(false)}>
              <View style={[styles.modalIcon, { backgroundColor: colors.primary + '15' }]}>
                <MaterialCommunityIcons name="bike" size={24} color={colors.primary} />
              </View>
              <Text style={styles.modalOptionText}>Ride</Text>
              <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textSecondary} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={() => setModalVisible(false)}>
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FE',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 6,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
  },
  activeTab: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  activeTabText: {
    color: '#fff',
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 100,
  },
  // Calendar Styles
  calendarContainer: {
    backgroundColor: '#fff',
    marginHorizontal: spacing.lg,
    borderRadius: 24,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  calendarNav: {
    flexDirection: 'row',
    gap: 8,
  },
  navButton: {
    padding: 4,
    backgroundColor: '#F4F7FE',
    borderRadius: 12,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  weekDayText: {
    width: (width - 80) / 7,
    textAlign: 'center',
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  dayCell: {
    width: (width - 80) / 7,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    borderRadius: 20,
  },
  todayCell: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  dayText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  todayText: {
    color: '#fff',
    fontWeight: '700',
  },
  activityDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.success,
    position: 'absolute',
    bottom: 6,
  },
  // Activity Card
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  cardValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  // FAB
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 32,
    padding: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: '#F4F7FE',
    padding: 16,
    borderRadius: 20,
  },
  modalIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: spacing.md,
    color: colors.text,
  },
  closeButton: {
    marginTop: spacing.lg,
    alignItems: 'center',
    padding: 12,
  },
  closeButtonText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 16,
  },
});
