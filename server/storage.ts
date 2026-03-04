import { db } from "./db";
import { users, messages, type User, type InsertUser, type Message, type InsertMessage, type SafeUser } from "@shared/schema";
import { eq, or, and, gt, asc } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresStore = connectPg(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserStatus(id: number, isOnline: boolean, lastOnline: Date): Promise<User | undefined>;
  getAllUsers(): Promise<SafeUser[]>;
  
  getMessagesBetween(userId1: number, userId2: number): Promise<Message[]>;
  createMessage(message: InsertMessage & { senderId: number, expiresAt: Date }): Promise<Message>;
  deleteMessage(id: number): Promise<boolean>;
  markMessageAsRead(id: number): Promise<Message | undefined>;
  getMessage(id: number): Promise<Message | undefined>;

  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserStatus(id: number, isOnline: boolean, lastOnline: Date): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ isOnline, lastOnline })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getAllUsers(): Promise<SafeUser[]> {
    return await db.select({
      id: users.id,
      username: users.username,
      lastOnline: users.lastOnline,
      isOnline: users.isOnline
    }).from(users);
  }

  async getMessagesBetween(userId1: number, userId2: number): Promise<Message[]> {
    const now = new Date();
    return await db.select().from(messages)
      .where(
        and(
          eq(messages.isDeleted, false),
          gt(messages.expiresAt, now),
          or(
            and(eq(messages.senderId, userId1), eq(messages.receiverId, userId2)),
            and(eq(messages.senderId, userId2), eq(messages.receiverId, userId1))
          )
        )
      )
      .orderBy(asc(messages.createdAt));
  }

  async createMessage(msg: InsertMessage & { senderId: number, expiresAt: Date }): Promise<Message> {
    const [message] = await db.insert(messages).values(msg).returning();
    return message;
  }

  async deleteMessage(id: number): Promise<boolean> {
    const [message] = await db.update(messages)
      .set({ isDeleted: true })
      .where(eq(messages.id, id))
      .returning();
    return !!message;
  }

  async markMessageAsRead(id: number): Promise<Message | undefined> {
    const [message] = await db.update(messages)
      .set({ isRead: true })
      .where(eq(messages.id, id))
      .returning();
    return message;
  }

  async getMessage(id: number): Promise<Message | undefined> {
    const [message] = await db.select().from(messages).where(eq(messages.id, id));
    return message;
  }
}

export const storage = new DatabaseStorage();
