/**
 * Type definitions for @browser-agent-bridge/extensions-core
 */

import type { DomCoreTools } from '@browser-agent-bridge/dom-core';

export interface SessionInfo {
  sessionId: string;
  createdAt: number;
  callerOrigin: string; // Origin of controller (e.g., https://app.example.com)
  tabIds: number[];
  permissions: Permission[];
  grantedOrigins: Set<string>; // Origins approved for this session (auto-allow all actions)
}

export interface Permission {
  type: 'navigation' | 'interaction' | 'evaluation' | 'data-access';
  granted: boolean;
  requestedAt: number;
  grantedAt?: number;
}

export interface TabInfo {
  id: number;
  url: string;
  title: string;
  sessionId: string;
}

export interface TabManager {
  tabs(params: {
    action: 'list' | 'create' | 'close' | 'select';
    index?: number;
    url?: string;
  }): Promise<TabInfo[]>;

  getSessionTabs(sessionId: string): Promise<TabInfo[]>;
  isTabAccessible(sessionId: string, tabId: number): Promise<boolean>;
}

export interface PermissionManager {
  requestPermission(params: {
    sessionId: string;
    type: Permission['type'];
    description: string;
    element?: string;
  }): Promise<boolean>;

  hasPermission(params: {
    sessionId: string;
    type: Permission['type'];
  }): Promise<boolean>;

  revokeSession(sessionId: string): Promise<void>;
}

export interface ExtensionCore {
  createSession(): Promise<SessionInfo>;
  getSession(sessionId: string): Promise<SessionInfo | null>;
  closeSession(sessionId: string): Promise<void>;

  tabs: TabManager;
  permissions: PermissionManager;

  executeTool<T = any>(params: {
    sessionId: string;
    tabId: number;
    tool: keyof DomCoreTools;
    args: any;
  }): Promise<T>;
}
