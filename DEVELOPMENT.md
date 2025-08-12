# Development Guide

## Setup

```bash
# Clone repository
git clone git@github.com:yesil/twint-node-sdk.git
cd twint-node-sdk

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your TWINT credentials

# Run development server
npm run dev
```

## Development Server

The SDK includes a development server with real TWINT integration:

```bash
npm run dev
```

Features:
- Real TWINT API integration (no mocks)
- Validates connection at startup
- Logs all operations to `server.log`
- Web UI demo at http://localhost:3000/demo
- API endpoints for testing

### API Endpoints

- `POST /api/orders/start` - Start new order
- `GET /api/orders/:orderId` - Monitor order status
- `POST /api/orders/:orderId/confirm` - Confirm order
- `POST /api/orders/:orderId/cancel` - Cancel order
- `GET /health` - Health check

### Environment Configuration

Create a `.env` file with:

```bash
# Certificate Configuration
TWINT_CERTIFICATE_PATH=certificate.p12
TWINT_CERTIFICATE_PASSWORD=your-password

# TWINT Configuration
TWINT_STORE_UUID=your-store-uuid

# Environment: PRODUCTION, INTEGRATION, or STAGING
TWINT_ENVIRONMENT=INTEGRATION

# Server Configuration
PORT=3000
LOG_LEVEL=info
```

## Web Components Demo

The SDK includes a reusable web component for integration testing:

```html
<pay-with-twint 
  reference="ORDER-123"
  amount="99.95"
  api-url="/api"
  theme="light"
  confirmation-needed="true">
</pay-with-twint>
```

Run the demo:
```bash
npm run dev:demo
```

This starts a web server with live reload for testing the web component.

## Testing

Tests use Node.js built-in test runner:

```bash
# Run all tests
npm test

# Run specific test file
node --test test/values/Money.test.js

# Run with watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### Writing Tests

Example test:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { Money } from '../src/values/Money.js';

test('Money.CHF creates Swiss Francs', () => {
  const amount = Money.CHF(99.95);
  assert.strictEqual(amount.amount, 99.95);
  assert.strictEqual(amount.currency, 'CHF');
});
```

## Code Quality

```bash
# Format code
npm run format

# Check formatting
npm run format:check

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

## Project Structure

```
twint-node-sdk/
├── src/
│   ├── client/            # Main TWINT client
│   │   └── TwintClient.js
│   ├── soap/              # SOAP/WSDL integration
│   │   └── SoapClient.js
│   ├── certificates/      # Certificate handling
│   │   └── Certificate.js
│   ├── values/            # Value objects
│   │   ├── Money.js
│   │   ├── OrderStatus.js
│   │   ├── Environment.js
│   │   └── Uuid.js
│   ├── components/        # Web components
│   │   └── pay-with-twint.js
│   └── index.js          # Main exports
├── wsdl/                  # TWINT WSDL definitions
│   └── v8.6/             # Current API version
├── demo/                  # Web UI demo
│   ├── index.html
│   └── app.js
├── test/                  # Test files
│   └── values/
│       └── Money.test.js
├── dev-server.js         # Development server
├── .env.example          # Environment template
└── package.json
```

## Adding New Features

### 1. Add a New SOAP Method

Edit `src/soap/SoapClient.js`:

```javascript
async newMethod(request) {
  if (!this.#client) {
    await this.initialize();
  }
  const [result] = await this.#client.NewMethodAsync(request);
  return result;
}
```

### 2. Add Client Method

Edit `src/client/TwintClient.js`:

```javascript
async newFeature(params) {
  const request = {
    MerchantInformation: this.#merchantInfo,
    // ... build request
  };
  
  const response = await this.#soapClient.newMethod(request);
  return this.#mapResponse(response);
}
```

### 3. Add Value Objects

Create new value objects in `src/values/`:

```javascript
export class NewValue {
  #value;
  
  constructor(value) {
    this.#value = value;
  }
  
  get value() {
    return this.#value;
  }
  
  toString() {
    return this.#value.toString();
  }
}
```

### 4. Export in Index

Add to `src/index.js`:

```javascript
export { NewValue } from './values/NewValue.js';
```

## Debugging

### Enable SOAP Debug Logging

Set environment variable:
```bash
SOAP_DEBUG=true
```

This will:
- Log formatted XML requests/responses to console
- Save structured logs to `server.log`
- Show request/response correlation

### Common Issues

#### Certificate Loading
- Ensure .p12 file exists and path is correct
- Check certificate password
- Verify certificate isn't expired

#### TWINT Connection
- Use INTEGRATION environment for development
- Ensure Store UUID matches certificate
- Check firewall/proxy settings

#### Module Resolution
- Always use `.js` extension in imports
- Use ES module syntax (`import`/`export`)
- Ensure Node.js 20+ is installed

## Release Process

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Run tests: `npm test`
4. Check code quality: `npm run lint`
5. Commit changes
6. Tag release: `git tag v1.0.0`
7. Push with tags: `git push --tags`

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Make changes and test
4. Commit with descriptive message
5. Push to your fork
6. Create Pull Request

### Code Style

- Use ES modules (no CommonJS)
- Use private fields with `#` syntax
- Use async/await for asynchronous code
- No TypeScript (pure JavaScript)
- Follow existing patterns in codebase

### Commit Messages

Use conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `test:` Tests
- `refactor:` Code refactoring
- `chore:` Maintenance

## Support

For development questions:
- GitHub Issues: https://github.com/yesil/twint-node-sdk/issues
- TWINT Documentation: https://www.twint.ch/en/business/