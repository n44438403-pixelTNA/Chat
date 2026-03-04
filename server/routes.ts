import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import session from "express-session";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Session middleware
  app.use(session({
    secret: process.env.SESSION_SECRET || 'snapchat-clone-secret',
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
  }));

  // Auth middleware helper
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  };

  app.post(api.auth.register.path, async (req, res) => {
    try {
      const input = api.auth.register.input.parse(req.body);
      const existingUser = await storage.getUserByUsername(input.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      const user = await storage.createUser(input);
      req.session.userId = user.id;
      
      const { password, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.auth.login.path, async (req, res) => {
    try {
      const input = api.auth.login.input.parse(req.body);
      const user = await storage.getUserByUsername(input.username);
      
      if (!user || user.password !== input.password) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      
      req.session.userId = user.id;
      await storage.updateUserStatus(user.id, true, new Date());
      
      const { password, ...safeUser } = user;
      res.status(200).json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.auth.logout.path, requireAuth, async (req, res) => {
    if (req.session.userId) {
      await storage.updateUserStatus(req.session.userId, false, new Date());
    }
    req.session.destroy(() => {
      res.status(200).json({ success: true });
    });
  });

  app.get(api.auth.me.path, async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { password, ...safeUser } = user;
    
    // Update online status implicitly
    await storage.updateUserStatus(user.id, true, new Date());
    
    res.status(200).json(safeUser);
  });

  app.get(api.users.list.path, requireAuth, async (req, res) => {
    const users = await storage.getAllUsers();
    // Exclude current user
    const otherUsers = users.filter(u => u.id !== req.session.userId);
    res.status(200).json(otherUsers);
  });

  app.post(api.users.updateStatus.path, requireAuth, async (req, res) => {
    const { isOnline } = req.body;
    const user = await storage.updateUserStatus(req.session.userId!, isOnline, new Date());
    if (user) {
      const { password, ...safeUser } = user;
      res.status(200).json(safeUser);
    } else {
      res.status(404).json({ message: "User not found" });
    }
  });

  app.get(api.messages.list.path, requireAuth, async (req, res) => {
    const otherUserId = Number(req.params.userId);
    const messages = await storage.getMessagesBetween(req.session.userId!, otherUserId);
    res.status(200).json(messages);
  });

  app.post(api.messages.send.path, requireAuth, async (req, res) => {
    try {
      const input = api.messages.send.input.parse(req.body);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      const msg = await storage.createMessage({
        ...input,
        senderId: req.session.userId!,
        expiresAt,
      });
      res.status(201).json(msg);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.messages.delete.path, requireAuth, async (req, res) => {
    const msgId = Number(req.params.id);
    const msg = await storage.getMessage(msgId);
    if (!msg) {
      return res.status(404).json({ message: "Not found" });
    }
    if (msg.senderId !== req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    await storage.deleteMessage(msgId);
    res.status(200).json({ success: true });
  });

  app.patch(api.messages.read.path, requireAuth, async (req, res) => {
    const msgId = Number(req.params.id);
    const msg = await storage.getMessage(msgId);
    if (!msg) {
      return res.status(404).json({ message: "Not found" });
    }
    if (msg.receiverId !== req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const updatedMsg = await storage.markMessageAsRead(msgId);
    res.status(200).json(updatedMsg);
  });

  return httpServer;
}
