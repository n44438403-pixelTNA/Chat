import { z } from 'zod';
import { insertUserSchema, insertMessageSchema } from './schema';

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  unauthorized: z.object({ message: z.string() }),
};

export const safeUserSchema = z.object({
  id: z.number(),
  username: z.string(),
  lastOnline: z.union([z.string(), z.date(), z.null()]).optional(),
  isOnline: z.boolean().nullable().optional(),
});

export const messageSchema = z.object({
  id: z.number(),
  senderId: z.number(),
  receiverId: z.number(),
  content: z.string(),
  createdAt: z.union([z.string(), z.date()]),
  expiresAt: z.union([z.string(), z.date()]),
  isDeleted: z.boolean(),
  replyToId: z.number().nullable(),
  isRead: z.boolean(),
});

export const api = {
  auth: {
    register: {
      method: 'POST' as const,
      path: '/api/register' as const,
      input: insertUserSchema,
      responses: {
        201: safeUserSchema,
        400: errorSchemas.validation,
      },
    },
    login: {
      method: 'POST' as const,
      path: '/api/login' as const,
      input: insertUserSchema,
      responses: {
        200: safeUserSchema,
        401: errorSchemas.unauthorized,
      },
    },
    me: {
      method: 'GET' as const,
      path: '/api/me' as const,
      responses: {
        200: safeUserSchema,
        401: errorSchemas.unauthorized,
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/logout' as const,
      responses: {
        200: z.object({ success: z.boolean() }),
      }
    }
  },
  users: {
    list: {
      method: 'GET' as const,
      path: '/api/users' as const,
      responses: {
        200: z.array(safeUserSchema),
      },
    },
    updateStatus: {
      method: 'POST' as const,
      path: '/api/users/status' as const,
      input: z.object({ isOnline: z.boolean() }),
      responses: {
        200: safeUserSchema,
      }
    }
  },
  messages: {
    list: {
      method: 'GET' as const,
      path: '/api/messages/:userId' as const,
      responses: {
        200: z.array(messageSchema),
      },
    },
    send: {
      method: 'POST' as const,
      path: '/api/messages' as const,
      input: insertMessageSchema,
      responses: {
        201: messageSchema,
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/messages/:id' as const,
      responses: {
        200: z.object({ success: z.boolean() }),
        404: errorSchemas.notFound,
      },
    },
    read: {
      method: 'PATCH' as const,
      path: '/api/messages/:id/read' as const,
      responses: {
        200: messageSchema,
        404: errorSchemas.notFound,
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
