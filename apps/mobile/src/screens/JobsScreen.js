import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import JobSummary from '../components/JobSummary';
import { fetchJobs as apiFetchJobs } from '../lib/api';

const JobsScreen = ({ navigation }) => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [error, setError] = useState(null);

  // Fetch jobs on mount and when status filter changes
  useEffect(() => {
    refreshJobs();
  }, [activeFilter]);

  const refreshJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      const status = activeFilter === 'all' ? undefined : activeFilter;
      const rows = await apiFetchJobs({ limit: 50, status });
      setJobs(
        rows.map((j, i) => ({
          id: j.id ?? `job-${i}`,
          model: j.model_name || j.title || 'unknown',
          status: j.status || 'unknown',
          cost: Number(j.payment_offer ?? 0),
          timestamp: j.created_at,
          provider: j.client_name || '—',
          description: j.title || '',
          inputTokens: Number(j.input_tokens ?? 0),
          outputTokens: Number(j.output_tokens ?? 0),
        })),
      );
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setError(err?.message ?? 'Failed to load jobs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  // Filter jobs by search input only — status filter is server-side.
  const filteredJobs = jobs.filter((job) => {
    if (!filter) return true;
    const needle = filter.toLowerCase();
    return (
      (job.model || '').toLowerCase().includes(needle) ||
      (job.description || '').toLowerCase().includes(needle) ||
      (job.id || '').toLowerCase().includes(needle)
    );
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
          onRefresh={refreshJobs}
          refreshing={loading}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {error
              ? error
              : filter || activeFilter !== 'all'
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
