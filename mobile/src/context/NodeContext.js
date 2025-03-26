import React, { createContext, useState, useContext, useEffect } from 'react';
import pocketbase, { availableNodes } from '../lib/pocketbase.js';

// Create the context
const NodeContext = createContext();

// Custom hook to use the node context
export const useNode = () => useContext(NodeContext);

// Provider component
export const NodeProvider = ({ children }) => {
  const [nodes, setNodes] = useState([]);
  const [localNodes, setLocalNodes] = useState([]);
  const [remoteNodes, setRemoteNodes] = useState([]);
  const [activeNodes, setActiveNodes] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Subscribe to availableNodes store from PocketBase
  useEffect(() => {
    const unsubscribe = availableNodes.subscribe(($nodes) => {
      setNodes($nodes);
      setLocalNodes($nodes.filter(node => node.source === 'local'));
      setRemoteNodes($nodes.filter(node => node.source === 'remote'));
      setActiveNodes($nodes.filter(node => 
        node.status === 'active' || node.status === 'available'
      ));
    });

    // Initialize connection to PocketBase
    connectToPocketBase();

    // Clean up subscription
    return () => {
      unsubscribe();
      disconnectFromPocketBase();
    };
  }, []);

  // Connect to PocketBase
  const connectToPocketBase = async (url = 'http://127.0.0.1:8090') => {
    try {
      setIsLoading(true);
      setConnectionError(null);
      
      const success = await pocketbase.init(url);
      setIsConnected(success);
      
      if (success) {
        await refreshNodes();
      }
      
      return success;
    } catch (error) {
      console.error('Failed to connect to PocketBase:', error);
      setConnectionError(error.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Disconnect from PocketBase
  const disconnectFromPocketBase = () => {
    pocketbase.disconnect();
    setIsConnected(false);
  };

  // Refresh nodes list
  const refreshNodes = async () => {
    try {
      setIsLoading(true);
      await pocketbase.fetchNodes();
      return true;
    } catch (error) {
      console.error('Failed to refresh nodes:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Submit a job to the network
  const submitJob = async (jobData) => {
    try {
      setIsLoading(true);
      return await pocketbase.submitJob(jobData);
    } catch (error) {
      console.error('Failed to submit job:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Get job status
  const getJobStatus = async (jobId) => {
    try {
      return await pocketbase.getJobStatus(jobId);
    } catch (error) {
      console.error('Failed to get job status:', error);
      throw error;
    }
  };

  // Get user jobs
  const getUserJobs = async (userId) => {
    try {
      setIsLoading(true);
      return await pocketbase.getUserJobs(userId);
    } catch (error) {
      console.error('Failed to get user jobs:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <NodeContext.Provider
      value={{
        nodes,
        localNodes,
        remoteNodes,
        activeNodes,
        isConnected,
        connectionError,
        isLoading,
        connectToPocketBase,
        disconnectFromPocketBase,
        refreshNodes,
        submitJob,
        getJobStatus,
        getUserJobs
      }}
    >
      {children}
    </NodeContext.Provider>
  );
};
