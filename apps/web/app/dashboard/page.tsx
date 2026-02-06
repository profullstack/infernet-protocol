'use client';

import { useState } from 'react';

export default function Dashboard() {
  const [nodeStatus, setNodeStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [peerId, setPeerId] = useState<string>('');
  const [connectedPeers, setConnectedPeers] = useState(0);

  const startNode = async () => {
    setNodeStatus('connecting');
    try {
      // In browser, we initialize a libp2p node via the SDK
      // For now, this is a placeholder
      // const { Infernet } = await import('@infernet/sdk');
      // const node = new Infernet({ ... });
      // await node.start();
      setNodeStatus('connected');
      setPeerId('12D3KooW...');
    } catch (err) {
      console.error('Failed to start node:', err);
      setNodeStatus('disconnected');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">
            Infernet <span className="text-infernet-600">Dashboard</span>
          </h1>
          <div className="flex items-center gap-3">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                nodeStatus === 'connected'
                  ? 'bg-green-500'
                  : nodeStatus === 'connecting'
                    ? 'bg-yellow-500 animate-pulse'
                    : 'bg-red-500'
              }`}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">
              {nodeStatus}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatusCard title="Peer ID" value={peerId || '—'} />
          <StatusCard title="Connected Peers" value={String(connectedPeers)} />
          <StatusCard title="Active Jobs" value="0" />
          <StatusCard title="Total Earned" value="0 USDC" />
        </div>

        {/* Connect */}
        {nodeStatus === 'disconnected' && (
          <div className="text-center py-16">
            <p className="text-gray-500 mb-6">
              Connect to the Infernet network to start providing or consuming compute.
            </p>
            <button
              onClick={startNode}
              className="px-8 py-3 bg-infernet-600 text-white rounded-lg font-medium hover:bg-infernet-700 transition-colors"
            >
              Connect to Network
            </button>
          </div>
        )}

        {/* Connected View */}
        {nodeStatus === 'connected' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Jobs Panel */}
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-6 bg-white dark:bg-gray-900">
              <h2 className="text-lg font-semibold mb-4">Jobs</h2>
              <p className="text-sm text-gray-500">No active jobs. Submit a job or wait for incoming requests.</p>
            </div>

            {/* Peers Panel */}
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-6 bg-white dark:bg-gray-900">
              <h2 className="text-lg font-semibold mb-4">Peers</h2>
              <p className="text-sm text-gray-500">Discovering peers on the network...</p>
            </div>

            {/* Payments Panel */}
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-6 bg-white dark:bg-gray-900">
              <h2 className="text-lg font-semibold mb-4">Payments</h2>
              <p className="text-sm text-gray-500">No transactions yet.</p>
            </div>

            {/* Hardware Panel */}
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-6 bg-white dark:bg-gray-900">
              <h2 className="text-lg font-semibold mb-4">Hardware</h2>
              <p className="text-sm text-gray-500">Detecting capabilities...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 bg-white dark:bg-gray-900">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{title}</p>
      <p className="text-lg font-semibold truncate">{value}</p>
    </div>
  );
}
