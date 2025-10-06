import { Server, Socket } from 'socket.io';
import { logger } from '@/utils/logger';
import jwt from 'jsonwebtoken';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

let ioInstance: Server | null = null;

export function setupWebSocket(io: Server): void {
  ioInstance = io;

  // Authentication middleware
  io.use((socket: Socket, next) => {
    try {
      const token = (socket.handshake as any).auth?.token || (socket.handshake.headers?.authorization as string | undefined)?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      (socket as AuthenticatedSocket).userId = decoded.userId;
      (socket as AuthenticatedSocket).userRole = decoded.role;

      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    logger.info(`User ${authSocket.userId} connected via WebSocket`);

    // Join user-specific room
    authSocket.join(`user:${authSocket.userId}`);

    // Join admin room if user is admin
    if (authSocket.userRole === 'admin') {
      authSocket.join('admin');
    }

    // Handle repository-specific subscriptions
    authSocket.on('subscribe:repository', (repositoryId: string) => {
      authSocket.join(`repository:${repositoryId}`);
      logger.info(`User ${authSocket.userId} subscribed to repository ${repositoryId}`);
    });

    authSocket.on('unsubscribe:repository', (repositoryId: string) => {
      authSocket.leave(`repository:${repositoryId}`);
      logger.info(`User ${authSocket.userId} unsubscribed from repository ${repositoryId}`);
    });

    // Handle PR-specific subscriptions
    authSocket.on('subscribe:pr', (prId: string) => {
      authSocket.join(`pr:${prId}`);
      logger.info(`User ${authSocket.userId} subscribed to PR ${prId}`);
    });

    authSocket.on('unsubscribe:pr', (prId: string) => {
      authSocket.leave(`pr:${prId}`);
      logger.info(`User ${authSocket.userId} unsubscribed from PR ${prId}`);
    });

    authSocket.on('disconnect', () => {
      logger.info(`User ${authSocket.userId} disconnected from WebSocket`);
    });
  });

  logger.info('WebSocket server configured');
}

// Helper functions for emitting events
export function emitToUser(userId: string, event: string, data: any): void {
  if (!ioInstance) return;
  ioInstance.to(`user:${userId}`).emit(event, data);
}

export function emitToRepository(repositoryId: string, event: string, data: any): void {
  if (!ioInstance) return;
  ioInstance.to(`repository:${repositoryId}`).emit(event, data);
}

export function emitToPR(prId: string, event: string, data: any): void {
  if (!ioInstance) return;
  ioInstance.to(`pr:${prId}`).emit(event, data);
}

export function emitToAdmins(event: string, data: any): void {
  if (!ioInstance) return;
  ioInstance.to('admin').emit(event, data);
}

export function emitToAll(event: string, data: any): void {
  if (!ioInstance) return;
  ioInstance.emit(event, data);
}
