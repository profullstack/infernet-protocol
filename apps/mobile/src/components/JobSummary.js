import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';

const JobSummary = ({ job, onPress }) => {
  // Format the timestamp
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return '#10b981'; // green
      case 'processing':
        return '#3b82f6'; // blue
      case 'pending':
        return '#f59e0b'; // yellow
      case 'failed':
        return '#ef4444'; // red
      default:
        return '#6b7280'; // gray
    }
  };

  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress(job.id)}>
      <View style={styles.leftContent}>
        <Text style={styles.model}>{job.model}</Text>
        <Text style={styles.timestamp}>{formatDate(job.timestamp)}</Text>
      </View>
      
      <View style={styles.rightContent}>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(job.status) }]}>
          <Text style={styles.statusText}>{job.status}</Text>
        </View>
        <Text style={styles.cost}>${job.cost}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f5',
  },
  leftContent: {
    flex: 1,
  },
  model: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212529',
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 14,
    color: '#6c757d',
  },
  rightContent: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 4,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  cost: {
    fontSize: 14,
    fontWeight: '500',
    color: '#212529',
  },
});

export default JobSummary;
