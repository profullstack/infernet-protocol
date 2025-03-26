import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import JobSummary from '../components/JobSummary';

const JobsScreen = ({ navigation }) => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  // Fetch jobs on mount
  useEffect(() => {
    fetchJobs();
  }, []);

  // Simulate fetching jobs from PocketBase
  const fetchJobs = async () => {
    setLoading(true);
    
    try {
      // In a real app, this would be a call to PocketBase
      // For demo, we'll simulate an API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Generate mock jobs
      const mockJobs = Array.from({ length: 20 }, (_, i) => ({
        id: `job-${Date.now()}-${i}`,
        model: `llama-${Math.floor(Math.random() * 3) + 1}b-${Math.floor(Math.random() * 3) + 1}t`,
        status: Math.random() > 0.3 ? 'completed' : 
                Math.random() > 0.5 ? 'processing' : 
                Math.random() > 0.7 ? 'pending' : 'failed',
        cost: parseFloat((Math.random() * 2).toFixed(4)),
        timestamp: new Date(Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000)).toISOString(),
        provider: `provider-${Math.floor(Math.random() * 100)}`,
        description: `Sample inference job ${i+1}`,
        inputTokens: Math.floor(Math.random() * 500) + 100,
        outputTokens: Math.floor(Math.random() * 1000) + 200
      }));
      
      setJobs(mockJobs);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter jobs based on search input and status filter
  const filteredJobs = jobs.filter(job => {
    const matchesSearch = 
      job.model.toLowerCase().includes(filter.toLowerCase()) ||
      job.description.toLowerCase().includes(filter.toLowerCase()) ||
      job.id.toLowerCase().includes(filter.toLowerCase());
      
    const matchesStatus = 
      activeFilter === 'all' || 
      job.status === activeFilter;
      
    return matchesSearch && matchesStatus;
  });

  // Handle job selection
  const handleJobPress = (jobId) => {
    // In a real app, navigate to job details
    console.log('Selected job:', jobId);
    // navigation.navigate('JobDetails', { jobId });
  };

  // Render filter buttons
  const FilterButton = ({ title, value }) => (
    <TouchableOpacity
      style={[styles.filterButton, activeFilter === value && styles.activeFilterButton]}
      onPress={() => setActiveFilter(value)}
    >
      <Text 
        style={[styles.filterButtonText, activeFilter === value && styles.activeFilterButtonText]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Jobs</Text>
      </View>
      
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search jobs..."
          value={filter}
          onChangeText={setFilter}
        />
      </View>
      
      <View style={styles.filtersContainer}>
        <FilterButton title="All" value="all" />
        <FilterButton title="Pending" value="pending" />
        <FilterButton title="Processing" value="processing" />
        <FilterButton title="Completed" value="completed" />
        <FilterButton title="Failed" value="failed" />
      </View>
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3a86ff" />
          <Text style={styles.loadingText}>Loading jobs...</Text>
        </View>
      ) : filteredJobs.length > 0 ? (
        <FlatList
          data={filteredJobs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <JobSummary job={item} onPress={handleJobPress} />
          )}
          contentContainerStyle={styles.listContent}
          onRefresh={fetchJobs}
          refreshing={loading}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {filter || activeFilter !== 'all' 
              ? 'No jobs match your filters' 
              : 'No jobs found'}
          </Text>
          <TouchableOpacity 
            style={styles.newJobButton}
            onPress={() => {}}
          >
            <Text style={styles.newJobButtonText}>Submit New Job</Text>
          </TouchableOpacity>
        </View>
      )}
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
    paddingBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchInput: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexWrap: 'wrap',
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#e9ecef',
    marginRight: 8,
    marginBottom: 8,
  },
  activeFilterButton: {
    backgroundColor: '#3a86ff',
  },
  filterButtonText: {
    color: '#495057',
    fontWeight: '500',
    fontSize: 14,
  },
  activeFilterButtonText: {
    color: 'white',
  },
  listContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  loadingText: {
    marginTop: 16,
    color: '#6c757d',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  emptyText: {
    color: '#6c757d',
    fontSize: 16,
    marginBottom: 20,
  },
  newJobButton: {
    backgroundColor: '#3a86ff',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  newJobButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default JobsScreen;
