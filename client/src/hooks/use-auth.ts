import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertUser } from "@shared/routes";
import { z } from "zod";

function parseResponse<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error("API Validation failed", result.error);
    throw new Error("Invalid API response format");
  }
  return result.data;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading, error } = useQuery({
    queryKey: [api.auth.me.path],
    queryFn: async () => {
      const res = await fetch(api.auth.me.path, { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch user");
      return parseResponse(api.auth.me.responses[200], await res.json());
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      const res = await fetch(api.auth.login.path, {
        method: api.auth.login.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        credentials: "include",
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Login failed");
      
      return parseResponse(api.auth.login.responses[200], data);
    },
    onSuccess: (data) => {
      queryClient.setQueryData([api.auth.me.path], data);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      const res = await fetch(api.auth.register.path, {
        method: api.auth.register.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        credentials: "include",
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Registration failed");
      
      return parseResponse(api.auth.register.responses[201], data);
    },
    onSuccess: (data) => {
      queryClient.setQueryData([api.auth.me.path], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(api.auth.logout.path, {
        method: api.auth.logout.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Logout failed");
    },
    onSuccess: () => {
      queryClient.setQueryData([api.auth.me.path], null);
      queryClient.clear();
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (isOnline: boolean) => {
      const res = await fetch(api.users.updateStatus.path, {
        method: api.users.updateStatus.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOnline }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Status update failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
    }
  });

  return {
    user,
    isLoading,
    error,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    register: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    logout: logoutMutation.mutateAsync,
    updateStatus: updateStatusMutation.mutateAsync,
  };
}
