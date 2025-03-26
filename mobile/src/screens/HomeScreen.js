import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useAuth } from '../context/AuthContext';

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

  // Fetch data on mount
  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Simulate fetching dashboard data
  const fetchDashboardData = async () => {
    setRefreshing(true);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock data for demonstration
    setStats({
      activeJobs: Math.floor(Math.random() * 5),
      completedJobs: Math.floor(Math.random() * 20) + 5,
      totalSpent: parseFloat((Math.random() * 10).toFixed(2)),
      availableProviders: Math.floor(Math.random() * 50) + 10
    });
    
    // Generate mock recent jobs
    const mockJobs = Array.from({ length: 5 }, (_, i) => ({
      id: `job-${Date.now()}-${i}`,
      model: `llama-${Math.floor(Math.random() * 3) + 1}b-${Math.floor(Math.random() * 3) + 1}t`,
      status: Math.random() > 0.3 ? 'completed' : Math.random() > 0.5 ? 'processing' : 'pending',
      cost: parseFloat((Math.random() * 2).toFixed(4)),
      timestamp: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)).toISOString(),
      provider: `provider-${Math.floor(Math.random() * 100)}`
    }));
    
    setRecentJobs(mockJobs);
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {user?.name || 'User'}</Text>
        <Text style={styles.subGreeting}>Welcome to Infernet Protocol</Text>
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
          
          {recentJobs.length > 0 ? (
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
