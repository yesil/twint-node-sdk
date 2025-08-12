import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import winston from 'winston';
import QRCode from 'qrcode';
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
const PORT = process.env.PORT || 3000;

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    new winston.transports.File({
      filename: 'server.log',
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

// TWINT Client initialization
let twintClient = null;
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

    // Initialize client
    twintClient = new TwintClient({
      certificate,
      storeUuid: process.env.TWINT_STORE_UUID,
      environment,
    });

    logger.info('TWINT client initialized successfully', {
      environment: environment.name,
      storeUuid: process.env.TWINT_STORE_UUID,
    });

    // Test connection
    const status = await twintClient.checkSystemStatus();
    logger.info('TWINT system status', status);

    return true;
  } catch (error) {
    logger.error('Failed to initialize TWINT client:', error.message);
    return false;
  }
}

// API Routes - Real TWINT operations
app.post('/api/orders/start', async (req, res) => {
  try {
    if (!twintClient) {
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

    // Start real TWINT order
    const order = await twintClient.startOrder({
      reference: reference || UnfiledMerchantTransactionReference.generate(),
      amount: Money.CHF(amount),
      confirmationNeeded,
    });

    // Generate QR code
    let qrCodeDataUrl = null;
    if (order.qrCode) {
      try {
        qrCodeDataUrl = await QRCode.toDataURL(order.qrCode, {
          width: 300,
          margin: 2,
        });
      } catch (qrError) {
        logger.warn('Failed to generate QR code image:', qrError.message);
        qrCodeDataUrl = order.qrCode;
      }
    }

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

    logger.info('Order started', {
      orderId: orderData.id,
      reference: orderData.reference,
      amount: orderData.amount.value,
    });

    res.json({
      success: true,
      data: orderData,
    });
  } catch (error) {
    logger.error('Failed to start order:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/api/orders/:orderId', async (req, res) => {
  try {
    if (!twintClient) {
      throw new Error('TWINT client not initialized');
    }

    const { orderId } = req.params;

    logger.info('Monitoring order', { orderId });

    // Monitor real TWINT order
    const order = await twintClient.monitorOrder(orderId);

    const storedOrder = orderStore.get(orderId);
    const orderData = {
      id: orderId,
      reference: storedOrder?.reference,
      amount: storedOrder?.amount || {
        value: order.amount?.amount || 0,
        currency: order.amount?.currency || 'CHF',
      },
      status: order.status.toString(),
      transactionStatus: order.transactionStatus?.toString(),
      pairingToken: storedOrder?.pairingToken,
      qrCode: storedOrder?.qrCode,
      confirmationNeeded: storedOrder?.confirmationNeeded,
      updatedAt: new Date().toISOString(),
    };

    orderStore.set(orderId, orderData);

    logger.info('Order monitored', {
      orderId,
      status: orderData.status,
      transactionStatus: orderData.transactionStatus,
    });

    res.json({
      success: true,
      data: orderData,
    });
  } catch (error) {
    logger.error('Failed to monitor order:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/api/orders/:orderId/confirm', async (req, res) => {
  try {
    if (!twintClient) {
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
    const order = await twintClient.confirmOrder(orderId, Money.CHF(amount));

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

app.post('/api/orders/:orderId/cancel', async (req, res) => {
  try {
    if (!twintClient) {
      throw new Error('TWINT client not initialized');
    }

    const { orderId } = req.params;

    logger.info('Cancelling order', { orderId });

    // Cancel real TWINT order
    const order = await twintClient.cancelOrder(orderId);

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
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    twintClient: twintClient !== null,
  };

  if (twintClient) {
    try {
      const systemStatus = await twintClient.checkSystemStatus();
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

// Serve demo page at root
app.get('/', (req, res) => {
  res.redirect('/demo/');
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
    process.exit(1);
  }

  app.listen(PORT, () => {
    logger.info('Server started', {
      port: PORT,
      environment: process.env.TWINT_ENVIRONMENT || 'INTEGRATION',
      twintClient: 'CONNECTED',
    });
    console.log(`
╔════════════════════════════════════════════════╗
║   TWINT SDK Development Server                 ║
╠════════════════════════════════════════════════╣
║   Server: http://localhost:${PORT}                ║
║   Demo: http://localhost:${PORT}/demo             ║
║   Environment: ${process.env.TWINT_ENVIRONMENT || 'INTEGRATION'}${' '.repeat(32 - (process.env.TWINT_ENVIRONMENT || 'INTEGRATION').length)}║
║   TWINT Client: CONNECTED ✓                    ║
║   Logs: server.log                             ║
║   SOAP Debug: ${process.env.SOAP_DEBUG === 'true' ? 'ENABLED 🔍' : 'DISABLED'}${' '.repeat(22 - (process.env.SOAP_DEBUG === 'true' ? 'ENABLED 🔍' : 'DISABLED').length)}║
╚════════════════════════════════════════════════╝

API Endpoints (Real TWINT):
- POST /api/orders/start         Start new order
- GET  /api/orders/:orderId      Monitor order
- POST /api/orders/:orderId/confirm  Confirm order
- POST /api/orders/:orderId/cancel   Cancel order
- GET  /health                   Health check

${process.env.SOAP_DEBUG === 'true' ? '📋 SOAP debugging enabled - XML requests/responses will be shown in console' : '💡 Tip: Set SOAP_DEBUG=true in .env to see formatted XML requests/responses'}
    `);
  });
}

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
