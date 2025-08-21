import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import winston from 'winston';
import {
  TwintClient,
  Environment,
  Money,
  CertificateContainer,
  UnfiledMerchantTransactionReference,
} from './src/index.js';

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
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// TWINT client middleware - makes client available as req.twint
app.use((req, res, next) => {
  if (twintClient) {
    req.twint = twintClient;
  }
  next();
});

// TWINT Client initialization
let twintClient = null;
let cashRegisterId = null;
const orderStore = new Map();

async function initializeTwintClient() {
  try {
    // Check for required environment variables
    if (!process.env.TWINT_CERTIFICATE_PATH || !process.env.TWINT_STORE_UUID) {
      throw new Error(
        'Missing required environment variables: TWINT_CERTIFICATE_PATH and TWINT_STORE_UUID',
      );
    }

    // Load certificate
    const certificatePath = path.resolve(process.env.TWINT_CERTIFICATE_PATH);
    logger.info(`Loading certificate from: ${certificatePath}`);

    const certificate = await CertificateContainer.fromFile(
      certificatePath,
      process.env.TWINT_CERTIFICATE_PASSWORD || null,
    );

    // Determine environment
    let environment;
    switch (process.env.TWINT_ENVIRONMENT) {
    case 'PRODUCTION':
      environment = Environment.PRODUCTION;
      break;
    case 'INTEGRATION':
      environment = Environment.INTEGRATION;
      break;
    case 'STAGING':
      environment = Environment.STAGING;
      break;
    default:
      environment = Environment.INTEGRATION; // Default to integration for dev
    }

    // Check for required cash register ID
    if (!process.env.TWINT_CASH_REGISTER_ID) {
      throw new Error('TWINT_CASH_REGISTER_ID is required in environment variables');
    }

    cashRegisterId = process.env.TWINT_CASH_REGISTER_ID;

    // Initialize client with required cash register ID and mandatory event handlers
    twintClient = new TwintClient({
      certificate,
      storeUuid: process.env.TWINT_STORE_UUID,
      environment,
      cashRegisterId: cashRegisterId,
      handlers: {
        success: (order) => {
          logger.info('✅ Payment successful', { 
            orderId: order.id.toString(),
            amount: order.amount,
            reference: order.merchantTransactionReference?.toString()
          });
          
          // Update order in store
          const storedOrder = orderStore.get(order.id.toString());
          if (storedOrder) {
            storedOrder.status = 'SUCCESS';
            storedOrder.completedAt = new Date().toISOString();
          }
        },
        
        cancel: (order) => {
          logger.warn('❌ Payment cancelled', {
            orderId: order.id.toString(),
            status: order.status.toString(),
            reason: order.transactionStatus
          });
          
          // Update order in store
          const storedOrder = orderStore.get(order.id.toString());
          if (storedOrder) {
            storedOrder.status = order.status.toString();
            storedOrder.cancelledAt = new Date().toISOString();
          }
        },
        
        error: (error, order) => {
          logger.error('⚠️ Payment error', {
            orderId: order?.id?.toString(),
            error: error.message
          });
          
          // Mark order as failed if we have the order ID
          if (order?.id) {
            const storedOrder = orderStore.get(order.id.toString());
            if (storedOrder) {
              storedOrder.status = 'ERROR';
              storedOrder.error = error.message;
              storedOrder.errorAt = new Date().toISOString();
            }
          }
        },
        
        statusChange: (order) => {
          logger.debug('📊 Order status update', {
            orderId: order.id.toString(),
            status: order.status.toString(),
            transactionStatus: order.transactionStatus
          });
          
          // Update stored order status
          const storedOrder = orderStore.get(order.id.toString());
          if (storedOrder) {
            storedOrder.status = order.status.toString();
            storedOrder.transactionStatus = order.transactionStatus;
            storedOrder.lastUpdated = new Date().toISOString();
          }
        }
      },
      monitoringInterval: 2000 // Check every 2 seconds
    });

    logger.info('TWINT client initialized', {
      environment: environment.name,
      storeUuid: process.env.TWINT_STORE_UUID,
      cashRegisterId: cashRegisterId,
    });

    // Enroll the cash register at startup
    try {
      logger.info('Enrolling cash register with TWINT...', { cashRegisterId });
      const enrollmentResult = await twintClient.enrollCashRegister('EPOS', cashRegisterId);
      logger.info('Cash register enrolled successfully', {
        cashRegisterId: enrollmentResult.cashRegisterId,
        beaconUuid: enrollmentResult.beaconUuid,
        majorId: enrollmentResult.majorId,
        minorId: enrollmentResult.minorId,
      });
    } catch (enrollError) {
      // If enrollment fails, it might be because the cash register is already enrolled
      // Log the error but continue, as the cash register might already be registered
      logger.warn('Cash register enrollment failed (may already be enrolled)', {
        cashRegisterId: cashRegisterId,
        error: enrollError.message,
      });
    }

    return true;
  } catch (error) {
    logger.error('Failed to initialize TWINT client:', error.message);
    return false;
  }
}

// API Routes - Real TWINT operations with /twint prefix
app.post('/twint/orders/start', async (req, res) => {
  try {
    if (!req.twint) {
      throw new Error('TWINT client not initialized');
    }

    const { reference, amount, confirmationNeeded = true } = req.body;

    if (!reference || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: reference and positive amount are required',
      });
    }

    logger.info('Starting order', { reference, amount, confirmationNeeded });

    // Start real TWINT order - monitoring begins automatically
    const order = await req.twint.startOrder({
      reference: reference || UnfiledMerchantTransactionReference.generate(),
      amount: Money.CHF(amount),
      confirmationNeeded,
      autoMonitor: true // Enable automatic monitoring
    });

    // Use the QR code directly from TWINT response (it's already a base64 data URL)
    if (!order.qrCode) {
      logger.error('No QR code received from TWINT API');
      return res.status(500).json({
        success: false,
        error: 'TWINT API did not return a QR code',
      });
    }
    
    if (!order.pairingToken) {
      logger.error('No pairing token received from TWINT API');
      return res.status(500).json({
        success: false,
        error: 'TWINT API did not return a pairing token',
      });
    }

    let qrCodeDataUrl = order.qrCode;

    const orderData = {
      id: order.id.toString(),
      reference,
      amount: {
        value: amount,
        currency: 'CHF',
      },
      status: order.status.toString(),
      pairingToken: order.pairingToken,
      qrCode: qrCodeDataUrl,
      confirmationNeeded,
      createdAt: new Date().toISOString(),
    };

    orderStore.set(orderData.id, orderData);

    logger.info('Order started with automatic monitoring', {
      orderId: orderData.id,
      reference: orderData.reference,
      amount: orderData.amount.value,
      monitoring: 'active'
    });

    res.json({
      success: true,
      data: orderData,
      message: 'Order started and monitoring automatically'
    });
  } catch (error) {
    logger.error('Failed to start order:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/twint/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    // Check if order exists in store (updated by event handlers)
    const storedOrder = orderStore.get(orderId);
    
    if (!storedOrder) {
      // If not in store, try to fetch it
      if (!req.twint) {
        throw new Error('TWINT client not initialized');
      }
      
      logger.info('Fetching order status', { orderId });
      const order = await req.twint.monitorOrder(orderId);
      
      const orderData = {
        id: orderId,
        amount: {
          value: order.amount?.amount || 0,
          currency: order.amount?.currency || 'CHF',
        },
        status: order.status.toString(),
        transactionStatus: order.transactionStatus?.toString(),
        updatedAt: new Date().toISOString(),
      };
      
      orderStore.set(orderId, orderData);
      
      res.json({
        success: true,
        data: orderData,
        monitoring: false
      });
    } else {
      // Return stored order (being updated by event handlers)
      res.json({
        success: true,
        data: storedOrder,
        monitoring: req.twint ? req.twint.stopMonitoring(orderId) : false
      });
    }
  } catch (error) {
    logger.error('Failed to monitor order:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// New endpoint to stop monitoring an order
app.post('/twint/orders/:orderId/stop-monitoring', async (req, res) => {
  try {
    if (!req.twint) {
      throw new Error('TWINT client not initialized');
    }

    const { orderId } = req.params;
    const stopped = req.twint.stopMonitoring(orderId);

    logger.info('Stopped monitoring order', { orderId, stopped });

    res.json({
      success: true,
      stopped,
      message: stopped ? 'Monitoring stopped' : 'Order was not being monitored'
    });
  } catch (error) {
    logger.error('Failed to stop monitoring:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/twint/orders/:orderId/confirm', async (req, res) => {
  try {
    if (!req.twint) {
      throw new Error('TWINT client not initialized');
    }

    const { orderId } = req.params;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount',
      });
    }

    logger.info('Confirming order', { orderId, amount });

    // Confirm real TWINT order
    const order = await req.twint.confirmOrder(orderId, Money.CHF(amount));

    const storedOrder = orderStore.get(orderId) || {};
    const orderData = {
      ...storedOrder,
      id: orderId,
      status: order.status.toString(),
      transactionStatus: order.transactionStatus?.toString(),
      confirmedAt: new Date().toISOString(),
    };

    orderStore.set(orderId, orderData);

    logger.info('Order confirmed', {
      orderId,
      status: orderData.status,
    });

    res.json({
      success: true,
      data: orderData,
    });
  } catch (error) {
    logger.error('Failed to confirm order:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/twint/orders/:orderId/cancel', async (req, res) => {
  try {
    if (!req.twint) {
      throw new Error('TWINT client not initialized');
    }

    const { orderId } = req.params;

    logger.info('Cancelling order', { orderId });

    // Cancel real TWINT order
    const order = await req.twint.cancelOrder(orderId);

    const storedOrder = orderStore.get(orderId) || {};
    const orderData = {
      ...storedOrder,
      id: orderId,
      status: order.status.toString(),
      cancelledAt: new Date().toISOString(),
    };

    orderStore.set(orderId, orderData);

    logger.info('Order cancelled', {
      orderId,
      status: orderData.status,
    });

    res.json({
      success: true,
      data: orderData,
    });
  } catch (error) {
    logger.error('Failed to cancel order:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Health check endpoint
app.get('/twint/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    twintClient: req.twint !== undefined,
    cashRegister: {
      enrolled: cashRegisterId !== null,
      id: cashRegisterId ? cashRegisterId.substring(0, 8) + '...' : null,
    },
    monitoring: {
      active: req.twint ? req.twint.getActiveMonitorsCount() : 0,
      enabled: true
    }
  };

  if (req.twint) {
    try {
      const systemStatus = await req.twint.checkSystemStatus();
      health.twintSystem = systemStatus;
    } catch (error) {
      health.twintSystem = {
        available: false,
        error: error.message,
      };
    }
  }

  res.json(health);
});

// Start server
async function startServer() {
  // Initialize TWINT client
  const initialized = await initializeTwintClient();

  if (!initialized) {
    logger.error('Failed to initialize TWINT client!');
    logger.error('Please check your .env configuration:');
    logger.error('- TWINT_CERTIFICATE_PATH: Path to your TWINT certificate');
    logger.error('- TWINT_CERTIFICATE_PASSWORD: Certificate password (if required)');
    logger.error('- TWINT_STORE_UUID: Your TWINT store UUID');
    logger.error('- TWINT_ENVIRONMENT: PRODUCTION, INTEGRATION, or STAGING');
    logger.error('- TWINT_CASH_REGISTER_ID: (Optional) Existing cash register ID');
    process.exit(1);
  }

  server = app.listen(PORT, () => {
    logger.info('TWINT API Server started', {
      port: PORT,
      environment: process.env.TWINT_ENVIRONMENT || 'INTEGRATION',
      twintClient: 'CONNECTED',
      cashRegisterId: cashRegisterId || 'NOT_ENROLLED',
    });
    
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
}

// Handle shutdown gracefully
let server;

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