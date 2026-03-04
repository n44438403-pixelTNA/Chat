import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertMessage } from "@shared/routes";

export function useUsers() {
  return useQuery({
    queryKey: [api.users.list.path],
    queryFn: async () => {
      const res = await fetch(api.users.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      return api.users.list.responses[200].parse(data);
    },
    // Poll every 10 seconds to update online status
    refetchInterval: 10000, 
  });
}

export function useMessages(userId: number | undefined) {
  return useQuery({
    queryKey: [api.messages.list.path, userId],
    queryFn: async () => {
      if (!userId) return [];
      const url = buildUrl(api.messages.list.path, { userId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();
      return api.messages.list.responses[200].parse(data);
    },
    enabled: !!userId,
    // Aggressive polling to simulate real-time chat
    refetchInterval: 2000, 
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (message: InsertMessage) => {
      const res = await fetch(api.messages.send.path, {
        method: api.messages.send.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to send message");
      }
      return api.messages.send.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      // Invalidate the chat with this specific receiver
      queryClient.invalidateQueries({ queryKey: [api.messages.list.path, variables.receiverId] });
    },
  });
}

export function useDeleteMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: number) => {
      const url = buildUrl(api.messages.delete.path, { id: messageId });
      const res = await fetch(url, {
        method: api.messages.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete message");
    },
    onSuccess: () => {
      // We invalidate all message lists since we don't know exactly which user it belonged to from just ID here
      queryClient.invalidateQueries({ queryKey: [api.messages.list.path] });
    },
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: number) => {
      const url = buildUrl(api.messages.read.path, { id: messageId });
      const res = await fetch(url, {
        method: api.messages.read.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to mark read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.messages.list.path] });
    },
  });
}
