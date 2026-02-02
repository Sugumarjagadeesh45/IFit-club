// src/WalletScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './apiConfig';

interface WalletScreenProps {
  navigation: any;
}

interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  category: 'incentive' | 'wallet_added' | 'wallet_withdrawn' | 'ride_earning' | 'working_hours_deduction';
  amount: number;
  description: string;
  date: string;
  status: 'completed' | 'pending' | 'failed';
}

interface WalletData {
  balance: number;
  currency: string;
  totalEarnings: number;
  pendingAmount: number;
  transactions: Transaction[];
}

const WalletScreen: React.FC<WalletScreenProps> = ({ navigation }) => {
  const [walletData, setWalletData] = useState<WalletData>({
    balance: 0,
    currency: 'INR',
    totalEarnings: 0,
    pendingAmount: 0,
    transactions: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ✅ Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    fetchWalletData();
  }, []);

  const fetchWalletData = async (page: number = 1, append: boolean = false) => {
    try {
      if (!append) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const driverInfoStr = await AsyncStorage.getItem('driverInfo');

      if (!driverInfoStr) {
        Alert.alert('Error', 'Authentication required');
        navigation.goBack();
        return;
      }

      const driverInfo = JSON.parse(driverInfoStr);
      const token = await AsyncStorage.getItem('authToken');

      // ✅ Fetch transactions from backend API with pagination
      try {
        const timestamp = new Date().getTime();
        const response = await fetch(
          `${API_BASE}/drivers/wallet/history/${driverInfo.driverId}?page=${page}&limit=${ITEMS_PER_PAGE}&t=${timestamp}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
          }
        );

        const result = await response.json();

        if (result.success && result.transactions) {
          console.log(`✅ Fetched ${result.transactions.length} transactions (page ${page})`);

          const newTransactions = append
            ? [...walletData.transactions, ...result.transactions]
            : result.transactions;

          setWalletData({
            balance: driverInfo.wallet || 0,
            currency: 'INR',
            totalEarnings: result.totalEarnings || driverInfo.wallet || 0,
            pendingAmount: result.pendingAmount || 0,
            transactions: newTransactions,
          });

          setTotalPages(result.totalPages || 1);
          setHasMore(result.hasMore || false);
          setCurrentPage(page);
        } else {
          // Backend endpoint doesn't exist yet, show empty state
          console.log('⚠️ Backend wallet history endpoint not available yet');
          setWalletData({
            balance: driverInfo.wallet || 0,
            currency: 'INR',
            totalEarnings: driverInfo.wallet || 0,
            pendingAmount: 0,
            transactions: [],
          });
        }
      } catch (apiError: any) {
        // Backend endpoint doesn't exist yet
        console.log('⚠️ Wallet history API not available:', apiError.message);
        setWalletData({
          balance: driverInfo.wallet || 0,
          currency: 'INR',
          totalEarnings: driverInfo.wallet || 0,
          pendingAmount: 0,
          transactions: [],
        });
      }
    } catch (error: any) {
      console.error('Error loading wallet data:', error);
      Alert.alert('Error', 'Failed to load wallet data');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    setCurrentPage(1);
    fetchWalletData(1, false); // Reset to page 1
  };

  // ✅ Load more transactions (pagination)
  const loadMoreTransactions = () => {
    if (!loadingMore && hasMore) {
      const nextPage = currentPage + 1;
      fetchWalletData(nextPage, true); // Append to existing transactions
    }
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTransactionIcon = (category: string) => {
    switch (category) {
      case 'incentive':
        return 'card-giftcard';
      case 'wallet_added':
        return 'add-circle';
      case 'wallet_withdrawn':
        return 'remove-circle';
      case 'ride_earning':
        return 'local-taxi';
      case 'working_hours_deduction':
        return 'access-time';
      default:
        return 'payment';
    }
  };

  const getTransactionLabel = (category: string) => {
    switch (category) {
      case 'incentive':
        return 'Incentive Amount';
      case 'wallet_added':
        return 'Wallet Added';
      case 'wallet_withdrawn':
        return 'Wallet Withdrawn';
      case 'ride_earning':
        return 'Ride Earning';
      case 'working_hours_deduction':
        return 'Extended Hours Fee';
      default:
        return 'Transaction';
    }
  };

  const TransactionItem = ({ transaction }: { transaction: Transaction }) => (
    <View style={styles.transactionItem}>
      <View
        style={[
          styles.transactionIcon,
          {
            backgroundColor:
              transaction.type === 'credit' ? '#d5f4e6' : '#fadbd8',
          },
        ]}
      >
        <MaterialIcons
          name={getTransactionIcon(transaction.category)}
          size={20}
          color={transaction.type === 'credit' ? '#27ae60' : '#e74c3c'}
        />
      </View>
      <View style={styles.transactionDetails}>
        <Text style={styles.transactionDescription}>
          {getTransactionLabel(transaction.category)}
        </Text>
        <Text style={styles.transactionDate}>{formatDate(transaction.date)}</Text>
      </View>
      <View style={styles.transactionAmountContainer}>
        <Text
          style={[
            styles.transactionAmount,
            {
              color: transaction.type === 'credit' ? '#27ae60' : '#e74c3c',
            },
          ]}
        >
          {transaction.type === 'credit' ? '+' : '-'}
          {formatCurrency(transaction.amount)}
        </Text>
        <Text
          style={[
            styles.transactionStatus,
            {
              color:
                transaction.status === 'completed'
                  ? '#27ae60'
                  : transaction.status === 'pending'
                  ? '#f39c12'
                  : '#e74c3c',
            },
          ]}
        >
          {transaction.status}
        </Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2ecc71" />
        <Text style={styles.loadingText}>Loading wallet...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#2ecc71', '#27ae60', '#229954']}
        style={styles.header}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Wallet</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2ecc71']} />
        }
      >
        {/* Balance Card */}
        <LinearGradient
          colors={['#2ecc71', '#27ae60']}
          style={styles.balanceCard}
        >
          <View style={styles.balanceHeader}>
            <MaterialIcons name="account-balance-wallet" size={30} color="#fff" />
            <Text style={styles.balanceLabel}>Current Balance</Text>
          </View>
          <Text style={styles.balanceAmount}>
            {formatCurrency(walletData.balance)}
          </Text>
          <TouchableOpacity style={styles.withdrawButton}>
            <MaterialIcons name="upload" size={20} color="#2ecc71" />
            <Text style={styles.withdrawButtonText}>Withdraw</Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* Stats Card - Total Earnings Only */}
        <View style={styles.statsContainer}>
          <View style={styles.statCardFull}>
            <MaterialIcons name="trending-up" size={32} color="#27ae60" />
            <Text style={styles.statValue}>
              {formatCurrency(walletData.totalEarnings)}
            </Text>
            <Text style={styles.statLabel}>Total Earnings</Text>
          </View>
        </View>

        {/* Add Wallet Amount Button */}
        <View style={styles.addWalletSection}>
          <TouchableOpacity style={styles.addWalletButton} onPress={() => {
            Alert.alert('Recharge Wallet', 'Payment integration coming soon!');
          }}>
            <LinearGradient
              colors={['#2ecc71', '#27ae60']}
              style={styles.addWalletGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <MaterialIcons name="add-circle" size={24} color="#fff" />
              <Text style={styles.addWalletText}>Add Wallet Amount - Recharge Now</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Transactions */}
        <View style={styles.transactionsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Transaction History</Text>
            {totalPages > 1 && (
              <Text style={styles.pageIndicator}>
                Page {currentPage} of {totalPages}
              </Text>
            )}
          </View>

          {walletData.transactions.length > 0 ? (
            <>
              {walletData.transactions.map((transaction) => (
                <TransactionItem key={transaction.id} transaction={transaction} />
              ))}

              {/* Load More Button */}
              {hasMore && (
                <TouchableOpacity
                  style={styles.loadMoreButton}
                  onPress={loadMoreTransactions}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <ActivityIndicator size="small" color="#2ecc71" />
                  ) : (
                    <>
                      <MaterialIcons name="expand-more" size={20} color="#2ecc71" />
                      <Text style={styles.loadMoreText}>Load More Transactions</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {/* End of List Indicator */}
              {!hasMore && walletData.transactions.length >= ITEMS_PER_PAGE && (
                <View style={styles.endOfListContainer}>
                  <View style={styles.endOfListDivider} />
                  <Text style={styles.endOfListText}>No more transactions</Text>
                  <View style={styles.endOfListDivider} />
                </View>
              )}
            </>
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="receipt-long" size={60} color="#bdc3c7" />
              <Text style={styles.emptyStateText}>No transactions yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Your wallet transactions will appear here
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#7f8c8d',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 15,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  balanceCard: {
    margin: 15,
    padding: 25,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  balanceLabel: {
    fontSize: 16,
    color: '#fff',
    marginLeft: 10,
    opacity: 0.9,
  },
  balanceAmount: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#fff',
    marginVertical: 15,
  },
  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
    alignSelf: 'flex-start',
  },
  withdrawButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2ecc71',
    marginLeft: 8,
  },
  addWalletSection: {
    paddingHorizontal: 15,
    marginBottom: 20,
  },
  addWalletButton: {
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#2ecc71',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  addWalletGradient: {
    height: 56,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  addWalletText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 10,
    letterSpacing: 0.5,
  },
  statsContainer: {
    paddingHorizontal: 15,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 15,
    marginHorizontal: 5,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statCardFull: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginTop: 10,
  },
  statLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 5,
  },
  transactionsSection: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  pageIndicator: {
    fontSize: 12,
    color: '#7f8c8d',
    fontWeight: '600',
  },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 15,
    borderWidth: 1.5,
    borderColor: '#2ecc71',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2ecc71',
    marginLeft: 8,
  },
  endOfListContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
    marginBottom: 10,
  },
  endOfListDivider: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  endOfListText: {
    fontSize: 12,
    color: '#95a5a6',
    marginHorizontal: 15,
    fontWeight: '500',
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: '#95a5a6',
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  transactionStatus: {
    fontSize: 11,
    textTransform: 'capitalize',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#7f8c8d',
    marginTop: 15,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#95a5a6',
    marginTop: 5,
  },
});

export default WalletScreen;
