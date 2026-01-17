/**
 * Parent Assistant - WhatsApp Worker Service
 * 
 * This service manages WhatsApp connections for all users.
 * Each user gets a dedicated worker that handles their WhatsApp session.
 */

// Load environment variables first
import 'dotenv/config';

import http from 'http';
import { WorkerManager } from './services/worker-manager.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { createServerClient } from '@parent-assistant/database';

// Environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PORT = parseInt(process.env.PORT || '3001', 10);
const WORKER_ID = `worker-${process.env.RENDER_INSTANCE_ID || process.pid}-${Date.now()}`;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

// Create Supabase client
const supabase = createServerClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Initialize worker manager
const workerManager = new WorkerManager(supabase);

// Track service start time
const startTime = Date.now();

// Health check HTTP server
const healthServer = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  
  if (url.pathname === '/health' || url.pathname === '/') {
    const health = {
      status: 'ok',
      workerId: WORKER_ID,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      activeWorkers: workerManager.getWorkerCount(),
      timestamp: new Date().toISOString()
    };
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
  } else if (url.pathname === '/status') {
    // More detailed status for debugging
    const workers: Record<string, string | null> = {};
    // Note: We'd need to expose getWorkerStatuses from WorkerManager
    
    const status = {
      workerId: WORKER_ID,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      activeWorkers: workerManager.getWorkerCount(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Graceful shutdown
let httpServer: http.Server | null = null;

async function shutdown() {
  console.log('\nShutting down worker service...');
  
  // Close HTTP server first
  if (httpServer) {
    httpServer.close();
  }
  
  stopScheduler();
  await workerManager.stopAll();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the service
async function main() {
  console.log('Starting Parent Assistant Worker Service...');
  console.log(`Worker ID: ${WORKER_ID}`);
  
  try {
    // Start health check server
    httpServer = healthServer.listen(PORT, () => {
      console.log(`Health check server listening on port ${PORT}`);
    });
    
    // Initialize WhatsApp workers
    await workerManager.initialize();
    console.log('Worker service initialized successfully');
    
    // Start the scheduler for daily digests and queue processing
    startScheduler(supabase);
    console.log('Scheduler started');
    
    // Keep the process running with health checks
    setInterval(() => {
      workerManager.healthCheck();
    }, 60000); // Health check every minute
    
    console.log('Worker service is running');
    
  } catch (error) {
    console.error('Failed to start worker service:', error);
    process.exit(1);
  }
}

main();

