/**
 * Worker Manager
 * 
 * Manages the lifecycle of WhatsApp workers for all users.
 * - Starts/stops workers based on user status
 * - Monitors worker health
 * - Handles reconnection logic
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@parent-assistant/database';
import { WhatsAppWorker } from './whatsapp-worker.js';
import type { SessionStatus } from '@parent-assistant/shared';

export class WorkerManager {
  private supabase: SupabaseClient<Database>;
  private workers: Map<string, WhatsAppWorker> = new Map();
  private isRunning = false;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
  }

  async initialize(): Promise<void> {
    this.isRunning = true;

    console.log('Loading sessions from database...');

    // Load all users who should have active workers (including disconnected for auto-reconnect)
    const { data: sessions, error } = await this.supabase
      .from('wa_sessions')
      .select('user_id, status')
      .in('status', ['connected', 'connecting', 'unstable', 'qr_required', 'disconnected']);

    console.log('Sessions query result:', { sessions, error });

    if (error) {
      console.error('Failed to load sessions:', error);
      return;
    }

    console.log(`Found ${sessions?.length || 0} sessions to start`);

    // Start workers for existing sessions
    for (const session of sessions || []) {
      console.log(`Starting worker for session: ${session.user_id} (status: ${session.status})`);
      await this.startWorker(session.user_id);
    }

    // Subscribe to session changes
    this.subscribeToSessionChanges();

    // Start polling for pending scan requests
    this.startScanPolling();

    console.log(`Initialized ${this.workers.size} workers`);
  }

  private subscribeToSessionChanges(): void {
    // Listen for session updates that require starting/stopping workers
    this.supabase
      .channel('wa_sessions_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wa_sessions'
        },
        async (payload) => {
          const session = payload.new as { user_id: string; status: SessionStatus };
          
          if (payload.eventType === 'DELETE') {
            await this.stopWorker((payload.old as { user_id: string }).user_id);
          } else if (session.status === 'qr_required' && !this.workers.has(session.user_id)) {
            // User wants to connect - start worker for QR generation
            await this.startWorker(session.user_id);
          }
        }
      )
      .subscribe();

    // Listen for scan requests
    this.supabase
      .channel('scan_requests_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'scan_requests'
        },
        async (payload) => {
          const scanRequest = payload.new as { id: string; group_id: string };
          await this.processScanRequest(scanRequest.id, scanRequest.group_id);
        }
      )
      .subscribe();
  }

  private async processScanRequest(requestId: string, groupId: string): Promise<void> {
    console.log(`[SCAN] ========================================`);
    console.log(`[SCAN] Processing scan request ${requestId}`);
    console.log(`[SCAN] Group ID: ${groupId}`);

    try {
      // Get group details to find the user
      const { data: group, error: groupError } = await this.supabase
        .from('groups')
        .select('user_id, wa_group_id, name')
        .eq('id', groupId)
        .single();

      if (groupError) {
        console.error(`[SCAN] Error fetching group:`, groupError);
      }

      if (!group) {
        throw new Error('Group not found');
      }

      console.log(`[SCAN] Group name: ${(group as any).name}`);
      console.log(`[SCAN] Group wa_group_id: ${group.wa_group_id}`);
      console.log(`[SCAN] User ID: ${group.user_id}`);

      // Update status to processing
      await this.supabase
        .from('scan_requests')
        .update({ status: 'processing' })
        .eq('id', requestId);

      // Get the worker for this user
      console.log(`[SCAN] Available workers: ${Array.from(this.workers.keys()).join(', ')}`);
      const worker = this.workers.get(group.user_id);
      console.log(`[SCAN] Worker found: ${!!worker}`);
      if (worker) {
        console.log(`[SCAN] Worker status: ${worker.getStatus()}`);
      }
      
      if (!worker || worker.getStatus() !== 'connected') {
        console.error(`[SCAN] Worker not connected! Worker exists: ${!!worker}, Status: ${worker?.getStatus()}`);
        throw new Error('WhatsApp not connected');
      }

      // Scan history - fetch more messages to catch today's content
      const messagesFound = await worker.scanGroupHistory(group.wa_group_id, 200);

      // Mark as completed
      await this.supabase
        .from('scan_requests')
        .update({
          status: 'completed',
          messages_found: messagesFound,
          completed_at: new Date().toISOString()
        })
        .eq('id', requestId);

      console.log(`Scan request ${requestId} completed with ${messagesFound} messages`);
    } catch (error) {
      console.error(`Scan request ${requestId} failed:`, error);
      
      await this.supabase
        .from('scan_requests')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString()
        })
        .eq('id', requestId);
    }
  }

  async startWorker(userId: string): Promise<void> {
    if (this.workers.has(userId)) {
      console.log(`Worker for user ${userId} already exists`);
      return;
    }

    console.log(`Starting worker for user ${userId}`);

    const worker = new WhatsAppWorker(userId, this.supabase);
    this.workers.set(userId, worker);

    try {
      await worker.start();
    } catch (error) {
      console.error(`Failed to start worker for user ${userId}:`, error);
      this.workers.delete(userId);
    }
  }

  async stopWorker(userId: string): Promise<void> {
    const worker = this.workers.get(userId);
    if (!worker) return;

    console.log(`Stopping worker for user ${userId}`);

    try {
      await worker.stop();
    } catch (error) {
      console.error(`Error stopping worker for user ${userId}:`, error);
    }

    this.workers.delete(userId);
  }

  async stopAll(): Promise<void> {
    this.isRunning = false;
    
    const stopPromises = Array.from(this.workers.keys()).map((userId) =>
      this.stopWorker(userId)
    );

    await Promise.all(stopPromises);
    console.log('All workers stopped');
  }

  async healthCheck(): Promise<void> {
    if (!this.isRunning) return;

    console.log(`Health check: ${this.workers.size} active workers`);

    for (const [userId, worker] of this.workers) {
      const status = worker.getStatus();
      
      // Check for stale workers
      if (status === 'unstable') {
        const lastHeartbeat = worker.getLastHeartbeat();
        const now = Date.now();
        
        // If unstable for more than 10 minutes, attempt reconnect
        if (lastHeartbeat && now - lastHeartbeat > 10 * 60 * 1000) {
          console.log(`Worker ${userId} unstable for too long, attempting reconnect`);
          await worker.reconnect();
        }
      }
    }
  }

  private startScanPolling(): void {
    // Poll for pending scan requests every 5 seconds
    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        const { data: pendingScans } = await this.supabase
          .from('scan_requests')
          .select('id, group_id')
          .eq('status', 'pending')
          .limit(5);

        for (const scan of pendingScans || []) {
          await this.processScanRequest(scan.id, scan.group_id);
        }
      } catch (error) {
        console.error('Error polling scan requests:', error);
      }
    }, 5000);
  }

  getWorkerCount(): number {
    return this.workers.size;
  }

  getWorkerStatus(userId: string): SessionStatus | null {
    const worker = this.workers.get(userId);
    return worker?.getStatus() || null;
  }

  async syncUserGroups(userId: string): Promise<{ id: string; name: string; participants: number }[] | null> {
    const worker = this.workers.get(userId);
    if (!worker || worker.getStatus() !== 'connected') {
      return null;
    }
    return worker.syncGroups();
  }

  getWorker(userId: string): WhatsAppWorker | undefined {
    return this.workers.get(userId);
  }
}

