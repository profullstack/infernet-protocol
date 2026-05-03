import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { fetchProviders as apiFetchProviders } from '../lib/api';

const ProvidersScreen = ({ navigation }) => {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    refreshProviders();
  }, []);

  const refreshProviders = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await apiFetchProviders({ limit: 50 });
      setProviders(
        rows.map((p, i) => ({
          id: p.id ?? `provider-${i}`,
          name: p.name || `Provider ${i + 1}`,
          status: p.status === 'available' ? 'online' : (p.status || 'offline'),
          reputation: p.reputation ?? '—',
          gpuSummary: p.gpu_summary || '—',
          cpuSummary: p.cpu_summary || '—',
          fabric: p.fabric || '',
          price: p.price_display ?? '—',
          cliVersion: p.cli_version ?? '—',
        })),
      );
    } catch (err) {
      console.error('Error fetching providers:', err);
      setError(err?.message ?? 'Failed to load providers');
      setProviders([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredProviders = providers.filter((provider) => {
    if (!searchQuery) return true;
    const needle = searchQuery.toLowerCase();
    return (
      provider.name.toLowerCase().includes(needle) ||
      provider.gpuSummary.toLowerCase().includes(needle) ||
      provider.cpuSummary.toLowerCase().includes(needle)
    );
  });

  // Render provider card
  const ProviderCard = ({ provider }) => (
    <TouchableOpacity 
      style={styles.providerCard}
      onPress={() => {
        // In a real app, navigate to provider details
        console.log('Selected provider:', provider.id);
        // navigation.navigate('ProviderDetails', { providerId: provider.id });
      }}
    >
      <View style={styles.providerHeader}>
        <Text style={styles.providerName}>{provider.name}</Text>
        <View style={[styles.statusBadge, { backgroundColor: provider.status === 'online' ? '#10b981' : '#6b7280' }]}>
          <Text style={styles.statusText}>{provider.status}</Text>
        </View>
      </View>
      
      <View style={styles.providerDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>GPU:</Text>
          <Text style={styles.detailValue}>{provider.gpuSummary}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>CPU:</Text>
          <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="tail">
            {provider.cpuSummary}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Price:</Text>
          <Text style={styles.detailValue}>{provider.price}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>CLI:</Text>
          <Text style={styles.detailValue}>{provider.cliVersion}</Text>
        </View>
      </View>

      <View style={styles.providerFooter}>
        <View style={styles.reputationContainer}>
          <Text style={styles.reputationText}>
            ⭐ {provider.reputation}
          </Text>
        </View>

        <TouchableOpacity style={styles.useProviderButton}>
          <Text style={styles.useProviderButtonText}>Use Provider</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Providers</Text>
      </View>
      
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search providers..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3a86ff" />
          <Text style={styles.loadingText}>Loading providers...</Text>
        </View>
      ) : filteredProviders.length > 0 ? (
        <FlatList
          data={filteredProviders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ProviderCard provider={item} />}
          contentContainerStyle={styles.listContent}
          onRefresh={refreshProviders}
          refreshing={loading}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {error
              ? error
              : searchQuery
                ? 'No providers match your search'
                : 'No providers found'}
          </Text>
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
  listContent: {
    padding: 16,
  },
  providerCard: {
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
  providerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  providerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  providerDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  detailLabel: {
    width: 70,
    fontSize: 14,
    color: '#6c757d',
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
    color: '#212529',
  },
  providerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f3f5',
  },
  reputationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reputationText: {
    fontSize: 14,
    color: '#212529',
  },
  useProviderButton: {
    backgroundColor: '#3a86ff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  useProviderButtonText: {
    color: 'white',
    fontWeight: '500',
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#6c757d',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#6c757d',
    fontSize: 16,
  },
});

export default ProvidersScreen;
