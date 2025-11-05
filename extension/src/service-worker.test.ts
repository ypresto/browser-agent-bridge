import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '@browser-agent-bridge/extensions-core';

describe('Service Worker', () => {
  it('should create SessionManager instance', () => {
    const sessionManager = new SessionManager();
    expect(sessionManager).toBeDefined();
  });

  it('should create session with unique ID', () => {
    const sessionManager = new SessionManager();
    const session1 = sessionManager.createSession();
    const session2 = sessionManager.createSession();

    expect(session1.sessionId).toBeDefined();
    expect(session2.sessionId).toBeDefined();
    expect(session1.sessionId).not.toBe(session2.sessionId);
  });
});
