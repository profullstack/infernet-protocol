<script>
  import { onMount } from 'svelte';
  import { pb } from '../lib/pocketbase';
  
  export let nodeId = null;
  
  let nodes = [];
  let selectedCoordinator = null;
  let selectedWorkers = [];
  let distributionStrategy = 'tensor_parallel';
  let isEnabled = false;
  let coordinatorPort = 3001;
  let workerPort = 3002;
  let isLoading = true;
  let isSaving = false;
  let message = '';
  let messageType = 'info';
  
  // Distribution strategies
  const strategies = [
    { value: 'tensor_parallel', label: 'Tensor Parallelism', description: 'Split model across workers horizontally' },
    { value: 'pipeline_parallel', label: 'Pipeline Parallelism', description: 'Process model in stages vertically' },
    { value: 'data_parallel', label: 'Data Parallelism', description: 'Process different inputs in parallel' }
  ];
  
  onMount(async () => {
    try {
      isLoading = true;
      
      // Load nodes
      nodes = await pb.collection('nodes').getFullList();
      
      // Load settings
      const enabledSetting = await getSetting('inference.distributed.enabled');
      isEnabled = enabledSetting ? JSON.parse(enabledSetting.value) : false;
      
      const coordinatorPortSetting = await getSetting('inference.distributed.coordinator_port');
      coordinatorPort = coordinatorPortSetting ? JSON.parse(coordinatorPortSetting.value) : 3001;
      
      const workerPortSetting = await getSetting('inference.distributed.worker_port');
      workerPort = workerPortSetting ? JSON.parse(workerPortSetting.value) : 3002;
      
      const strategySetting = await getSetting('inference.distributed.default_strategy');
      distributionStrategy = strategySetting ? JSON.parse(strategySetting.value) : 'tensor_parallel';
      
      // Load node roles
      if (nodeId) {
        const nodeRoles = await pb.collection('node_roles').getFullList({
          filter: `node="${nodeId}"`
        });
        
        if (nodeRoles.length > 0) {
          const role = nodeRoles[0];
          
          if (role.role === 'coordinator' || role.role === 'hybrid') {
            // This node is a coordinator, load its workers
            const distributedJobs = await pb.collection('distributed_jobs').getFullList({
              filter: `coordinator="${nodeId}"`
            });
            
            if (distributedJobs.length > 0) {
              selectedWorkers = distributedJobs[0].workers;
            }
          } else if (role.role === 'worker') {
            // This node is a worker, find its coordinator
            const distributedJobs = await pb.collection('distributed_jobs').getFullList({
              filter: `workers ~ "${nodeId}"`
            });
            
            if (distributedJobs.length > 0) {
              selectedCoordinator = distributedJobs[0].coordinator;
            }
          }
        }
      } else {
        // No node ID provided, just load the first coordinator
        const coordinatorRoles = await pb.collection('node_roles').getFullList({
          filter: `role="coordinator" || role="hybrid"`
        });
        
        if (coordinatorRoles.length > 0) {
          selectedCoordinator = coordinatorRoles[0].node;
        }
      }
    } catch (error) {
      console.error('Error loading distributed inference configuration:', error);
      message = `Error: ${error.message}`;
      messageType = 'error';
    } finally {
      isLoading = false;
    }
  });
  
  /**
   * Get a setting from PocketBase
   * 
   * @param {string} key - Setting key
   * @returns {Object|null} - Setting object or null
   */
  async function getSetting(key) {
    try {
      const settings = await pb.collection('settings').getFullList({
        filter: `key="${key}"`
      });
      
      return settings.length > 0 ? settings[0] : null;
    } catch (error) {
      console.error(`Error getting setting ${key}:`, error);
      return null;
    }
  }
  
  /**
   * Save a setting to PocketBase
   * 
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   */
  async function saveSetting(key, value) {
    try {
      const setting = await getSetting(key);
      
      if (setting) {
        // Update existing setting
        await pb.collection('settings').update(setting.id, {
          value: JSON.stringify(value)
        });
      } else {
        // Create new setting
        await pb.collection('settings').create({
          key,
          value: JSON.stringify(value),
          scope: 'node',
          description: `Setting for ${key}`
        });
      }
    } catch (error) {
      console.error(`Error saving setting ${key}:`, error);
      throw error;
    }
  }
  
  /**
   * Save distributed inference configuration
   */
  async function saveConfiguration() {
    try {
      isSaving = true;
      message = '';
      
      // Save settings
      await saveSetting('inference.distributed.enabled', isEnabled);
      await saveSetting('inference.distributed.coordinator_port', coordinatorPort);
      await saveSetting('inference.distributed.worker_port', workerPort);
      await saveSetting('inference.distributed.default_strategy', distributionStrategy);
      
      if (nodeId) {
        // Update node role
        const nodeRoles = await pb.collection('node_roles').getFullList({
          filter: `node="${nodeId}"`
        });
        
        let role = 'worker';
        
        if (selectedCoordinator === nodeId) {
          role = selectedWorkers.length > 0 ? 'hybrid' : 'coordinator';
        }
        
        if (nodeRoles.length > 0) {
          // Update existing role
          await pb.collection('node_roles').update(nodeRoles[0].id, {
            role,
            coordinator_address: selectedCoordinator === nodeId ? '' : `ws://${getNodeAddress(selectedCoordinator)}:${coordinatorPort}`,
            worker_address: role === 'coordinator' ? '' : `ws://${getNodeAddress(nodeId)}:${workerPort}`
          });
        } else {
          // Create new role
          await pb.collection('node_roles').create({
            node: nodeId,
            role,
            coordinator_address: selectedCoordinator === nodeId ? '' : `ws://${getNodeAddress(selectedCoordinator)}:${coordinatorPort}`,
            worker_address: role === 'coordinator' ? '' : `ws://${getNodeAddress(nodeId)}:${workerPort}`
          });
        }
      }
      
      message = 'Configuration saved successfully!';
      messageType = 'success';
    } catch (error) {
      console.error('Error saving configuration:', error);
      message = `Error: ${error.message}`;
      messageType = 'error';
    } finally {
      isSaving = false;
    }
  }
  
  /**
   * Get node address from node ID
   * 
   * @param {string} id - Node ID
   * @returns {string} - Node address
   */
  function getNodeAddress(id) {
    const node = nodes.find(n => n.id === id);
    return node?.address || 'localhost';
  }
  
  /**
   * Handle node role change
   */
  function handleRoleChange() {
    if (selectedCoordinator === nodeId) {
      // This node is a coordinator
      if (selectedWorkers.includes(nodeId)) {
        // Remove self from workers
        selectedWorkers = selectedWorkers.filter(w => w !== nodeId);
      }
    } else {
      // This node is a worker
      if (selectedWorkers.includes(nodeId)) {
        // Already in workers list
      } else {
        // Add self to workers list
        selectedWorkers = [...selectedWorkers, nodeId];
      }
    }
  }
</script>

<div class="distributed-inference-config">
  <h2>Distributed Inference Configuration</h2>
  
  {#if isLoading}
    <div class="loading">Loading configuration...</div>
  {:else}
    {#if message}
      <div class="message {messageType}">{message}</div>
    {/if}
    
    <div class="form-group">
      <label class="toggle" for="enable-distributed-inference">
        <input type="checkbox" id="enable-distributed-inference" bind:checked={isEnabled}>
        <span class="toggle-label">Enable Distributed Inference</span>
      </label>
    </div>
    
    {#if isEnabled}
      <div class="form-group">
        <label for="coordinator-node">Coordinator Node</label>
        <select id="coordinator-node" bind:value={selectedCoordinator} on:change={handleRoleChange}>
          <option value="">Select a coordinator</option>
          {#each nodes as node}
            <option value={node.id}>{node.name || node.id}</option>
          {/each}
        </select>
        <div class="help-text">The node that will coordinate distributed inference tasks</div>
      </div>
      
      {#if selectedCoordinator}
        <div class="form-group">
          <label id="worker-nodes-label">Worker Nodes</label>
          <div class="worker-selection" aria-labelledby="worker-nodes-label">
            {#each nodes as node, i}
              {#if node.id !== selectedCoordinator}
                <label class="checkbox" for="worker-{node.id}">
                  <input 
                    id="worker-{node.id}"
                    type="checkbox" 
                    bind:group={selectedWorkers} 
                    value={node.id}
                  >
                  <span>{node.name || node.id}</span>
                </label>
              {/if}
            {/each}
          </div>
          <div class="help-text">Nodes that will perform inference tasks</div>
        </div>
      {/if}
      
      <div class="form-group">
        <label for="distribution-strategy">Distribution Strategy</label>
        <select id="distribution-strategy" bind:value={distributionStrategy}>
          {#each strategies as strategy}
            <option value={strategy.value}>{strategy.label}</option>
          {/each}
        </select>
        <div class="help-text">
          {strategies.find(s => s.value === distributionStrategy)?.description}
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label for="coordinator-port">Coordinator Port</label>
          <input type="number" id="coordinator-port" bind:value={coordinatorPort} min="1024" max="65535">
        </div>
        
        <div class="form-group">
          <label for="worker-port">Worker Port</label>
          <input type="number" id="worker-port" bind:value={workerPort} min="1024" max="65535">
        </div>
      </div>
    {/if}
    
    <div class="form-actions">
      <button on:click={saveConfiguration} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save Configuration'}
      </button>
    </div>
  {/if}
</div>

<style>
  .distributed-inference-config {
    padding: 1rem;
    max-width: 800px;
    margin: 0 auto;
  }
  
  h2 {
    margin-bottom: 1.5rem;
    font-size: 1.5rem;
  }
  
  .loading {
    padding: 1rem;
    text-align: center;
    color: #666;
  }
  
  .message {
    padding: 0.75rem;
    margin-bottom: 1rem;
    border-radius: 4px;
  }
  
  .message.success {
    background-color: #d4edda;
    color: #155724;
  }
  
  .message.error {
    background-color: #f8d7da;
    color: #721c24;
  }
  
  .message.info {
    background-color: #d1ecf1;
    color: #0c5460;
  }
  
  .form-group {
    margin-bottom: 1.5rem;
  }
  
  .form-row {
    display: flex;
    gap: 1rem;
  }
  
  .form-row .form-group {
    flex: 1;
  }
  
  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: bold;
  }
  
  input[type="number"],
  select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
  }
  
  .toggle {
    display: flex;
    align-items: center;
    cursor: pointer;
  }
  
  .toggle input {
    margin-right: 0.5rem;
  }
  
  .worker-selection {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  
  .checkbox {
    display: flex;
    align-items: center;
    font-weight: normal;
  }
  
  .checkbox input {
    margin-right: 0.5rem;
  }
  
  .help-text {
    margin-top: 0.25rem;
    font-size: 0.875rem;
    color: #666;
  }
  
  .form-actions {
    margin-top: 2rem;
  }
  
  button {
    padding: 0.5rem 1rem;
    background-color: #4a5568;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  button:hover {
    background-color: #2d3748;
  }
  
  button:disabled {
    background-color: #a0aec0;
    cursor: not-allowed;
  }
</style>
