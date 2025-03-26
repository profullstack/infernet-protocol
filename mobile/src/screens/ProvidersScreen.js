import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';

const ProvidersScreen = ({ navigation }) => {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch providers on mount
  useEffect(() => {
    fetchProviders();
  }, []);

  // Simulate fetching providers from PocketBase
  const fetchProviders = async () => {
    setLoading(true);
    
    try {
      // In a real app, this would be a call to PocketBase
      // For demo, we'll simulate an API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Generate mock providers
      const mockProviders = Array.from({ length: 15 }, (_, i) => ({
        id: `provider-${i+1}`,
        name: `Provider ${i+1}`,
        status: Math.random() > 0.2 ? 'online' : 'offline',
        reputation: (Math.random() * 5).toFixed(1),
        jobsCompleted: Math.floor(Math.random() * 1000),
        gpuType: ['NVIDIA RTX 4090', 'NVIDIA RTX 3090', 'NVIDIA A100', 'AMD Radeon RX 7900 XTX'][Math.floor(Math.random() * 4)],
        gpuCount: Math.floor(Math.random() * 4) + 1,
        supportedModels: [
          'llama-2-7b',
          'llama-2-13b',
          'llama-2-70b',
          'mistral-7b',
          'mixtral-8x7b'
        ].slice(0, Math.floor(Math.random() * 5) + 1),
        pricePerToken: (Math.random() * 0.0001).toFixed(6),
        latency: Math.floor(Math.random() * 200) + 50, // ms
      }));
      
      setProviders(mockProviders);
    } catch (error) {
      console.error('Error fetching providers:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter providers based on search
  const filteredProviders = providers.filter(provider => {
    return (
      provider.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      provider.gpuType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      provider.supportedModels.some(model => 
        model.toLowerCase().includes(searchQuery.toLowerCase())
      )
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
          <Text style={styles.detailValue}>{provider.gpuCount}× {provider.gpuType}</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Models:</Text>
          <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="tail">
            {provider.supportedModels.join(', ')}
          </Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Price:</Text>
          <Text style={styles.detailValue}>${provider.pricePerToken}/token</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Latency:</Text>
          <Text style={styles.detailValue}>{provider.latency}ms</Text>
        </View>
      </View>
      
      <View style={styles.providerFooter}>
        <View style={styles.reputationContainer}>
          <Text style={styles.reputationText}>
            ⭐ {provider.reputation} ({provider.jobsCompleted} jobs)
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
          onRefresh={fetchProviders}
          refreshing={loading}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {searchQuery 
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
