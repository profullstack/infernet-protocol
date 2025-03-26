/**
 * Docker Execution Module for Infernet Protocol
 * Handles running inference tasks in Docker containers
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { createLogger } = require('../utils/logger');
const config = require('../config');
const { EventEmitter } = require('events');

// Promisify fs functions
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);
const stat = promisify(fs.stat);

const logger = createLogger('docker');

class DockerExecutor extends EventEmitter {
    constructor() {
        super();
        this.socketPath = config.docker.socketPath;
        this.defaultImage = config.docker.defaultImage;
        this.networkMode = config.docker.networkMode;
        this.cpuLimit = config.docker.cpuLimit;
        this.memoryLimit = config.docker.memoryLimit;
        this.gpuOptions = config.docker.gpuOptions;
        this.runningContainers = new Map();
    }

    /**
     * Initialize the Docker executor
     */
    async initialize() {
        try {
            logger.info('Initializing Docker executor...');
            
            // Check Docker availability
            await this._checkDockerAvailability();
            
            logger.info('Docker executor initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Docker executor:', error);
            throw error;
        }
    }

    /**
     * Run a task in a Docker container
     * @param {Object} taskConfig - Task configuration
     * @returns {Promise<Object>} - Task result
     */
    async runTask(taskConfig) {
        const taskId = taskConfig.taskId || `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        
        try {
            logger.info(`Running task ${taskId}...`);
            
            // Prepare task directory
            const taskDir = path.join(config.contentDelivery.tempDir, taskId);
            await this._ensureDirectoryExists(taskDir);
            
            // Prepare input data
            const inputPath = path.join(taskDir, 'input');
            await this._ensureDirectoryExists(inputPath);
            
            // Write input data files
            if (taskConfig.inputData) {
                if (Buffer.isBuffer(taskConfig.inputData) || typeof taskConfig.inputData === 'string') {
                    await writeFile(path.join(inputPath, 'input.bin'), taskConfig.inputData);
                } else if (typeof taskConfig.inputData === 'object') {
                    await writeFile(path.join(inputPath, 'input.json'), JSON.stringify(taskConfig.inputData));
                }
            }
            
            // Prepare output directory
            const outputPath = path.join(taskDir, 'output');
            await this._ensureDirectoryExists(outputPath);
            
            // Prepare Docker run command
            const image = taskConfig.image || this.defaultImage;
            const command = this._buildDockerCommand(taskId, image, taskConfig, taskDir);
            
            // Run Docker container
            const result = await this._runContainer(taskId, command);
            
            // Read output files
            const outputFiles = await this._readOutputFiles(outputPath);
            
            // Clean up task directory if requested
            if (taskConfig.cleanupAfterRun) {
                // Implementation note: We're not removing the task directory here
                // to keep the output files for debugging purposes.
                // A separate cleanup job should handle this.
            }
            
            const taskResult = {
                taskId,
                exitCode: result.exitCode,
                stdout: result.stdout,
                stderr: result.stderr,
                outputFiles,
                runTime: result.runTime
            };
            
            logger.info(`Task ${taskId} completed with exit code ${result.exitCode}`);
            
            this.emit('task.completed', taskId, taskResult);
            
            return taskResult;
        } catch (error) {
            logger.error(`Failed to run task ${taskId}:`, error);
            
            // Attempt to stop the container if it's still running
            try {
                if (this.runningContainers.has(taskId)) {
                    await this.stopTask(taskId);
                }
            } catch (stopError) {
                logger.error(`Failed to stop task ${taskId} after error:`, stopError);
            }
            
            this.emit('task.failed', taskId, error);
            
            throw error;
        }
    }

    /**
     * Stop a running task
     * @param {string} taskId - Task ID
     * @returns {Promise<boolean>} - Success status
     */
    async stopTask(taskId) {
        try {
            if (!this.runningContainers.has(taskId)) {
                logger.warn(`Task ${taskId} is not running`);
                return false;
            }
            
            const containerInfo = this.runningContainers.get(taskId);
            
            logger.info(`Stopping task ${taskId}...`);
            
            // Send SIGTERM to the process
            containerInfo.process.kill('SIGTERM');
            
            // Wait for the process to exit or force kill after timeout
            const forceKillTimeout = setTimeout(() => {
                if (this.runningContainers.has(taskId)) {
                    logger.warn(`Force killing task ${taskId}...`);
                    containerInfo.process.kill('SIGKILL');
                }
            }, 10000); // 10 seconds timeout
            
            return new Promise((resolve) => {
                containerInfo.process.once('exit', () => {
                    clearTimeout(forceKillTimeout);
                    this.runningContainers.delete(taskId);
                    logger.info(`Task ${taskId} stopped`);
                    this.emit('task.stopped', taskId);
                    resolve(true);
                });
            });
        } catch (error) {
            logger.error(`Failed to stop task ${taskId}:`, error);
            throw error;
        }
    }

    /**
     * Get the status of a running task
     * @param {string} taskId - Task ID
     * @returns {Object} - Task status
     */
    getTaskStatus(taskId) {
        if (!this.runningContainers.has(taskId)) {
            return { running: false, taskId };
        }
        
        const containerInfo = this.runningContainers.get(taskId);
        
        return {
            running: true,
            taskId,
            startTime: containerInfo.startTime,
            runTime: Date.now() - containerInfo.startTime
        };
    }

    /**
     * Get a list of all running tasks
     * @returns {Array<Object>} - List of running tasks
     */
    getRunningTasks() {
        const tasks = [];
        
        for (const [taskId, containerInfo] of this.runningContainers.entries()) {
            tasks.push({
                taskId,
                startTime: containerInfo.startTime,
                runTime: Date.now() - containerInfo.startTime
            });
        }
        
        return tasks;
    }

    /**
     * Check if Docker is available
     * @returns {Promise<boolean>} - Docker availability status
     * @private
     */
    async _checkDockerAvailability() {
        return new Promise((resolve, reject) => {
            const dockerProcess = spawn('docker', ['info']);
            
            let stdout = '';
            let stderr = '';
            
            dockerProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            dockerProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            dockerProcess.on('close', (code) => {
                if (code === 0) {
                    logger.info('Docker is available');
                    resolve(true);
                } else {
                    const error = new Error(`Docker is not available: ${stderr}`);
                    logger.error(error.message);
                    reject(error);
                }
            });
        });
    }

    /**
     * Build Docker run command
     * @param {string} taskId - Task ID
     * @param {string} image - Docker image
     * @param {Object} taskConfig - Task configuration
     * @param {string} taskDir - Task directory
     * @returns {Array<string>} - Docker command and arguments
     * @private
     */
    _buildDockerCommand(taskId, image, taskConfig, taskDir) {
        const command = ['run'];
        
        // Add container name
        command.push('--name', `infernet-${taskId}`);
        
        // Add remove flag to automatically remove the container when it exits
        command.push('--rm');
        
        // Add network mode
        command.push('--network', this.networkMode);
        
        // Add resource limits
        if (this.cpuLimit) {
            command.push('--cpus', this.cpuLimit);
        }
        
        if (this.memoryLimit) {
            command.push('--memory', this.memoryLimit);
        }
        
        // Add GPU options if specified
        if (this.gpuOptions) {
            command.push('--gpus', this.gpuOptions);
        }
        
        // Add volume mounts for input and output directories
        command.push('-v', `${path.join(taskDir, 'input')}:/input:ro`);
        command.push('-v', `${path.join(taskDir, 'output')}:/output:rw`);
        
        // Add environment variables
        if (taskConfig.env) {
            for (const [key, value] of Object.entries(taskConfig.env)) {
                command.push('-e', `${key}=${value}`);
            }
        }
        
        // Add image name
        command.push(image);
        
        // Add command and arguments if specified
        if (taskConfig.cmd) {
            if (Array.isArray(taskConfig.cmd)) {
                command.push(...taskConfig.cmd);
            } else {
                command.push(taskConfig.cmd);
            }
        }
        
        return command;
    }

    /**
     * Run a Docker container
     * @param {string} taskId - Task ID
     * @param {Array<string>} command - Docker command and arguments
     * @returns {Promise<Object>} - Container run result
     * @private
     */
    async _runContainer(taskId, command) {
        return new Promise((resolve, reject) => {
            logger.debug(`Running Docker command: docker ${command.join(' ')}`);
            
            const startTime = Date.now();
            const dockerProcess = spawn('docker', command);
            
            let stdout = '';
            let stderr = '';
            
            dockerProcess.stdout.on('data', (data) => {
                const chunk = data.toString();
                stdout += chunk;
                this.emit('task.stdout', taskId, chunk);
            });
            
            dockerProcess.stderr.on('data', (data) => {
                const chunk = data.toString();
                stderr += chunk;
                this.emit('task.stderr', taskId, chunk);
            });
            
            // Store the running container info
            this.runningContainers.set(taskId, {
                process: dockerProcess,
                startTime
            });
            
            this.emit('task.started', taskId);
            
            dockerProcess.on('close', (exitCode) => {
                const endTime = Date.now();
                const runTime = endTime - startTime;
                
                this.runningContainers.delete(taskId);
                
                resolve({
                    exitCode,
                    stdout,
                    stderr,
                    runTime
                });
            });
            
            dockerProcess.on('error', (error) => {
                this.runningContainers.delete(taskId);
                reject(error);
            });
        });
    }

    /**
     * Read output files from the output directory
     * @param {string} outputPath - Path to output directory
     * @returns {Promise<Object>} - Output files
     * @private
     */
    async _readOutputFiles(outputPath) {
        try {
            const files = await promisify(fs.readdir)(outputPath);
            const outputFiles = {};
            
            for (const file of files) {
                const filePath = path.join(outputPath, file);
                const fileStat = await stat(filePath);
                
                if (fileStat.isFile()) {
                    // Read file content
                    const content = await readFile(filePath);
                    
                    // Try to parse JSON if the file is a JSON file
                    if (file.endsWith('.json')) {
                        try {
                            outputFiles[file] = JSON.parse(content.toString());
                        } catch (error) {
                            outputFiles[file] = content.toString();
                        }
                    } else {
                        outputFiles[file] = content;
                    }
                }
            }
            
            return outputFiles;
        } catch (error) {
            logger.error(`Failed to read output files from ${outputPath}:`, error);
            return {};
        }
    }

    /**
     * Ensure a directory exists
     * @param {string} dir - Directory path
     * @returns {Promise<void>}
     * @private
     */
    async _ensureDirectoryExists(dir) {
        try {
            await stat(dir);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await mkdir(dir, { recursive: true });
                logger.debug(`Created directory: ${dir}`);
            } else {
                throw error;
            }
        }
    }

    /**
     * Shutdown the Docker executor
     */
    async shutdown() {
        logger.info('Shutting down Docker executor...');
        
        // Stop all running containers
        const runningTaskIds = [...this.runningContainers.keys()];
        
        for (const taskId of runningTaskIds) {
            try {
                await this.stopTask(taskId);
            } catch (error) {
                logger.error(`Failed to stop task ${taskId} during shutdown:`, error);
            }
        }
        
        logger.info('Docker executor shut down successfully');
    }
}

// Create a singleton instance
const dockerExecutor = new DockerExecutor();

module.exports = dockerExecutor;
