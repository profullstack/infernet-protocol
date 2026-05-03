import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, RefreshControl, Image } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { fetchJobs, fetchOverview } from '../lib/api';

// Components (we'll create these later)
import JobSummary from '../components/JobSummary';
import StatsCard from '../components/StatsCard';

const HomeScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    activeJobs: 0,
    completedJobs: 0,
    totalSpent: 0,
    availableProviders: 0
  });
  const [recentJobs, setRecentJobs] = useState([]);
  const [error, setError] = useState(null);

  // Fetch data on mount
  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [overview, jobs] = await Promise.all([
        fetchOverview().catch(() => ({})),
        fetchJobs({ limit: 5 }),
      ]);

      setStats({
        activeJobs: Number(overview?.activeJobs ?? 0),
        completedJobs: Number(overview?.completedJobs ?? 0),
        totalSpent: Number(overview?.totalSpent ?? 0),
        availableProviders: Number(overview?.availableProviders ?? 0),
      });

      setRecentJobs(
        (jobs ?? []).map((j) => ({
          id: j.id,
          model: j.model_name || j.title || 'unknown',
          status: j.status || 'unknown',
          cost: Number(j.payment_offer ?? 0),
          timestamp: j.created_at,
          provider: j.client_name || '—',
        })),
      );
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err?.message ?? 'Failed to load dashboard');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Image
            source={require('../../assets/logo.infernet.black.svg')}
            style={styles.logo}
            height={24}
            width={24}
          />
          <View style={styles.headerTextContainer}>
            <Text style={styles.greeting}>Hello, {user?.name || 'User'}</Text>
            <Text style={styles.subGreeting}>Welcome to Infernet Protocol</Text>
          </View>
        </View>
      </View>
      
      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={fetchDashboardData} />
        }
      >
        <View style={styles.statsContainer}>
          <StatsCard title="Active Jobs" value={stats.activeJobs} icon="🔄" />
          <StatsCard title="Completed" value={stats.completedJobs} icon="✅" />
          <StatsCard title="Total Spent" value={`$${stats.totalSpent}`} icon="💰" />
          <StatsCard title="Providers" value={stats.availableProviders} icon="🖥️" />
        </View>
        
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Jobs</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Jobs')}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          
          {error ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>{error}</Text>
            </View>
          ) : recentJobs.length > 0 ? (
            recentJobs.map(job => (
              <JobSummary key={job.id} job={job} onPress={() => {}} />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No recent jobs found</Text>
              <TouchableOpacity
                style={styles.newJobButton}
                onPress={() => {}}
              >
                <Text style={styles.newJobButtonText}>Submit New Job</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsContainer}>
            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.actionIcon}>🚀</Text>
              <Text style={styles.actionText}>New Job</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.actionIcon}>🔍</Text>
              <Text style={styles.actionText}>Find Providers</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.actionIcon}>📊</Text>
              <Text style={styles.actionText}>View Reports</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.actionIcon}>⚙️</Text>
              <Text style={styles.actionText}>Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#3a86ff',
    padding: 20,
    paddingTop: 60,
    paddingBottom: 30,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 24,
    height: 24,
    marginRight: 10,
    tintColor: 'white',
  },
  headerTextContainer: {
    flex: 1,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  subGreeting: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: -30,
    marginBottom: 16,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
  },
  seeAllText: {
    color: '#3a86ff',
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    padding: 20,
  },
  emptyStateText: {
    color: '#6c757d',
    marginBottom: 16,
  },
  newJobButton: {
    backgroundColor: '#3a86ff',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  newJobButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  actionButton: {
    width: '48%',
    backgroundColor: '#f1f3f5',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  actionText: {
    color: '#495057',
    fontWeight: '500',
  },
});

export default HomeScreen;
