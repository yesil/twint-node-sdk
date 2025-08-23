# TWINT Node.js SDK

A Node.js SDK for TWINT payment integration using pure ES modules.

## ⚠️ Disclaimer

**This is an experimental, unofficial SDK that is NOT affiliated with or supported by TWINT AG in any way.** 

This SDK is provided as-is without any guarantees or warranty. Users are responsible for testing and validating all functionality before using in production environments. Use at your own risk.

## Quick Start

### Installation

```bash
npm install git@github.com:yesil/twint-node-sdk.git#stable
```

### 1. Backend Setup (Express + TwintClient)

Create your Express server with TWINT integration:

```javascript
import express from 'express';
import { TwintClient } from 'twint-node-sdk';

const app = express();
app.use(express.json());

// Initialize TWINT client with callbacks
const twintClient = await TwintClient.fromEnvironment();

// Listen to payment events
twintClient.on('success', (order) => {
  console.log('Payment successful:', order.id.toString());
  // Handle successful payment
});

twintClient.on('cancel', (order) => {
  console.log('Payment cancelled:', order.id.toString());
  // Handle cancelled payment
});

twintClient.on('error', (error, order) => {
  console.error('Payment error:', error.message);
  // Handle payment error
});

// Register TWINT middleware
app.use('/twint', twintClient.middleware);

// Serve your frontend
app.use(express.static('public'));

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

### 2. Frontend Setup

Import and use the web component:

```html
<!DOCTYPE html>
<html>
<head>
  <title>TWINT Payment</title>
</head>
<body>
  <!-- Import the TWINT web component -->
  <script type="module">
    import 'twint-node-sdk/src/pay-with-twint.js';
  </script>
  
  <!-- Use the component -->
  <pay-with-twint 
    reference="ORDER-123"
    amount="99.95"
    api-url="/twint"
    merchant-name="Your Store">
  </pay-with-twint>
  
  <script>
    const payment = document.querySelector('pay-with-twint');
    
    payment.addEventListener('payment-completed', (e) => {
      console.log('Payment completed:', e.detail);
      // Redirect to success page or show confirmation
    });
    
    payment.addEventListener('payment-error', (e) => {
      console.error('Payment failed:', e.detail.error);
      // Show error message
    });
  </script>
</body>
</html>
```

### 3. Localized Example (German)

```html
<pay-with-twint 
  reference="BESTELLUNG-123"
  amount="149.90"
  api-url="/twint"
  merchant-name="Schweizer Laden"
  theme="dark"
  
  text-cancel-checkout="Abbrechen"
  text-payment-success="Zahlung erfolgreich!"
  text-thank-you="Vielen Dank für Ihre Zahlung"
  text-order-complete="Ihre Bestellung wurde erfolgreich abgeschlossen"
  text-payment-cancelled="Zahlung abgebrochen"
  text-order-cancelled="Ihre Bestellung wurde storniert"
  text-reference-label="Referenz"
  text-merchant-label="Händler"
  text-total-amount-label="Gesamtbetrag">
</pay-with-twint>
```

## Configuration

### Environment Variables

Create a `.env` file in your project root:

```bash
# Required
TWINT_CERTIFICATE_PATH=./path/to/your/certificate.p12
TWINT_CERTIFICATE_PASSWORD=your-certificate-password
TWINT_STORE_UUID=your-store-uuid
TWINT_CASH_REGISTER_ID=your-cash-register-id

# Optional
TWINT_ENVIRONMENT=INTEGRATION  # or PRODUCTION
```

### Component Attributes

Essential attributes for the web component:

| Attribute | Required | Description |
|-----------|----------|-------------|
| `reference` | Yes | Unique payment reference |
| `amount` | Yes | Amount in CHF |
| `api-url` | Yes | Backend API URL (usually `/twint`) |
| `merchant-name` | No | Your store name |
| `theme` | No | `light` or `dark` theme |

### Events

Listen to these events on the component:

- `payment-completed` - Payment was successful
- `payment-cancelled` - Payment was cancelled
- `payment-error` - An error occurred

## API Endpoints

The middleware automatically provides these endpoints:

- `POST /twint/orders/start` - Start new payment
- `GET /twint/orders/:orderId` - Get payment status
- `POST /twint/orders/:orderId/confirm` - Confirm payment
- `POST /twint/orders/:orderId/cancel` - Cancel payment

## Requirements

- Node.js 20.0.0 or higher
- TWINT merchant certificate (.p12 format)
- TWINT merchant credentials

## License

MIT