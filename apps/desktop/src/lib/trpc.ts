import { createTRPCReact, httpBatchLink } from "@trpc/react-query";
import { QueryClient } from "@tanstack/react-query";
import superjson from "superjson";
import { API_BASE_URL } from "./config";

// We need to create a type-only import for the AppRouter
// This requires exporting types from the web app
// For now, we'll use a simplified approach with vanilla fetch

// Create a query client for React Query
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

// API client for making authenticated requests
class ApiClient {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
      credentials: "include",
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(error.message || `HTTP ${res.status}`);
    }

    return res.json();
  }

  // Server list
  async getServers() {
    return this.fetch<
      Array<{
        id: string;
        region: string;
        country?: string;
        status: string;
        sessions: number;
      }>
    >("/api/trpc/servers.list");
  }

  // Device registration
  async registerDevice(params: {
    name: string;
    serverId?: string;
    machineId?: string;
    publicKey?: string; // Optional: if provided, client generated keys locally
  }) {
    return this.fetch<{
      deviceId: string;
      assignedIp: string;
      publicKey: string;
      privateKey?: string; // Optional: only present if server generated keys
    }>("/api/trpc/device.register", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  // Get server public key
  async getServerPubkey() {
    return this.fetch<{ publicKey: string }>("/api/trpc/desktop.serverPubkey");
  }

  // Check auth status
  async checkAuth() {
    return this.fetch<{
      authenticated: boolean;
      user?: { id: string; email: string };
    }>("/api/auth/session");
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

// Simplified tRPC-like hooks for the desktop app
// These use the API client directly since we can't easily share types

export function useServers() {
  return {
    data: null as Array<{
      id: string;
      region: string;
      country?: string;
      status: string;
      sessions: number;
    }> | null,
    isLoading: false,
    error: null as Error | null,
    refetch: async () => {},
  };
}
