import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import winston from 'winston';
import { TwintClient } from './src/index.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.DEV_SERVER_PORT || 9000;

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          // For SOAP messages, show them clearly
          if (meta.soap && process.env.SOAP_DEBUG === 'true') {
            return message;
          }
          return winston.format.simple().transform({ level, message, timestamp, ...meta })[Symbol.for('message')];
        })
      ),
    }),
    new winston.transports.File({
      filename: 'dev-server.log',
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    }),
  ],
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Initialize TWINT client and server
let server;
let twintClient;

async function startServer() {
  try {
    // Initialize TWINT client from environment - handles everything internally
    twintClient = await TwintClient.fromEnvironment({ logger });

    // Single line to handle ALL TWINT routes
    app.use('/twint', twintClient.middleware);

    // Start server
    server = app.listen(PORT, () => {
      logger.info('TWINT API Server started', {
        port: PORT,
        environment: process.env.TWINT_ENVIRONMENT || 'INTEGRATION',
        twintClient: 'CONNECTED',
      });
      
      const cashRegisterId = process.env.TWINT_CASH_REGISTER_ID;
      const cashRegisterStatus = cashRegisterId 
        ? `✓ (${cashRegisterId.substring(0, 8)}...)` 
        : 'NOT ENROLLED';
      
      console.log(`
╔════════════════════════════════════════════════╗
║   TWINT Development Server                     ║
╠════════════════════════════════════════════════╣
║   API Server: http://localhost:${PORT}            ║
║   Environment: ${process.env.TWINT_ENVIRONMENT || 'INTEGRATION'}${' '.repeat(32 - (process.env.TWINT_ENVIRONMENT || 'INTEGRATION').length)}║
║   TWINT Client: CONNECTED ✓                    ║
║   Cash Register: ${cashRegisterStatus}${' '.repeat(30 - cashRegisterStatus.length)}║
║   Logs: dev-server.log                         ║
║   SOAP Debug: ${process.env.SOAP_DEBUG === 'true' ? 'ENABLED 🔍' : 'DISABLED'}${' '.repeat(22 - (process.env.SOAP_DEBUG === 'true' ? 'ENABLED 🔍' : 'DISABLED').length)}║
╚════════════════════════════════════════════════╝

API Endpoints (Real TWINT):
- POST /twint/orders/start                Start new order (auto-monitors)
- GET  /twint/orders/:orderId            Get order status
- POST /twint/orders/:orderId/stop-monitoring  Stop monitoring
- POST /twint/orders/:orderId/confirm    Confirm order
- POST /twint/orders/:orderId/cancel     Cancel order
- GET  /twint/health                     Health check

${process.env.SOAP_DEBUG === 'true' ? '📋 SOAP debugging enabled - XML requests/responses will be shown in console' : '💡 Tip: Set SOAP_DEBUG=true in .env to see formatted XML requests/responses'}
      `);
    });
  } catch (error) {
    logger.error('Failed to initialize TWINT client:', error.message);
    logger.error('Please check your .env configuration:');
    logger.error('- TWINT_CERTIFICATE_PATH: Path to your TWINT certificate');
    logger.error('- TWINT_CERTIFICATE_PASSWORD: Certificate password (if required)');
    logger.error('- TWINT_STORE_UUID: Your TWINT store UUID');
    logger.error('- TWINT_ENVIRONMENT: PRODUCTION, INTEGRATION, or STAGING');
    logger.error('- TWINT_CASH_REGISTER_ID: Cash register ID');
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  
  // Stop all monitoring before shutdown
  if (twintClient) {
    logger.info('Stopping all order monitoring...');
    twintClient.stopAllMonitoring();
  }
  
  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  
  // Stop all monitoring before shutdown
  if (twintClient) {
    logger.info('Stopping all order monitoring...');
    twintClient.stopAllMonitoring();
  }
  
  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});