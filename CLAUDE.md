# TWINT Node.js SDK - AI Assistant Guide

## Project Overview
This is a **pure Node.js ES modules** implementation of the TWINT payment SDK for Swiss payment processing. A modern JavaScript with Node.js 20+.

## Critical Information

### Technology Stack
- **Language**: JavaScript ES modules.
- **Runtime**: Node.js 20+ (uses private fields `#` syntax)
- **API**: SOAP/WSDL based communication
- **Testing**: Node.js built-in test runner (`node --test`)
- **No Build Step**: Direct execution, no compilation needed

### Key Dependencies
```json
{
  "soap": "^1.0.0",      // SOAP client for TWINT API
  "uuid": "^9.0.1"        // UUID generation
}
```

## Core Components

### 1. Main Client (`src/client/TwintClient.js`)
- Entry point for all TWINT operations
- Handles authentication via certificates
- Manages cash register enrollment
- Methods: `startOrder()`, `monitorOrder()`, `confirmOrder()`, `cancelOrder()`, `reverseOrder()`

### 2. Certificate Handling (`src/certificates/Certificate.js`)
- Supports PKCS12 (.p12/.pfx) formats only
- Provides TLS options for SOAP client
- Usage: `CertificateContainer.fromFile(path, password)`

### 3. SOAP Integration (`src/soap/SoapClient.js`)
- Wraps the `soap` npm package
- Uses WSDL files from `wsdl/v8.6/`
- Auto-initializes on first API call
- Handles mTLS authentication

### 4. Value Objects (`src/values/`)
- `Money.js`: Monetary amounts with currency (mainly CHF)
- `OrderStatus.js`: Order state management
- `Environment.js`: API environments (PRODUCTION, INTEGRATION, STAGING)
- `Uuid.js`: Type-safe UUID handling
- All use private fields (`#`) for encapsulation

## Important Patterns

### Private Fields
```javascript
class Money {
  #amount;    // Private field syntax
  #currency;
  
  get amount() { return this.#amount; }
}
```

### ES Modules
```javascript
// Always use ES module syntax
import { TwintClient } from './client/TwintClient.js';
export class MyClass { }
```

### Async/Await
All API calls are asynchronous:
```javascript
const order = await client.startOrder({ ... });
```

## Testing

### Run Tests
```bash
npm test                    # Run all tests
node --test                 # Direct Node.js test runner
node --test --watch        # Watch mode
npm run test:coverage      # With coverage
```

### Test Structure
- Tests use Node.js built-in test runner
- Located in `test/` directory
- Pattern: `*.test.js`
- No external test framework (no Jest, Mocha, etc.)

## Development Server

### Express Server (`dev-server.js`)
- Real TWINT API integration (no mocks)
- UI at http://localhost:3000/demo
- Start with: `npm run dev`

### API Endpoints
- POST `/api/orders/start`
- GET `/api/orders/:orderId`
- POST `/api/orders/:orderId/confirm`
- POST `/api/orders/:orderId/cancel`

## WSDL/SOAP Configuration

### WSDL Files Location
```
wsdl/
├── v8.5/  (older version)
└── v8.6/  (current - default)
    ├── TWINTMerchantService_v8.6.wsdl
    └── *.xsd (schema definitions)
```

### Environments
- **PRODUCTION**: `https://service.twint.ch/merchant/service/TWINTMerchantServicev8_6`
- **INTEGRATION**: `https://int.service.twint.ch/merchant/service/TWINTMerchantServicev8_6`
- **STAGING**: `https://stage.service.twint.ch/merchant/service/TWINTMerchantServicev8_6`

## Common Tasks

### Start New Order
```javascript
import { TwintClient, Environment, Money, CertificateContainer } from './src/index.js';

const certificate = await CertificateContainer.fromFile('./cert.p12', 'password');
const client = new TwintClient({
  certificate,
  storeUuid: 'your-uuid',
  environment: Environment.PRODUCTION
});

const order = await client.startOrder({
  reference: 'ORDER-123',
  amount: Money.CHF(99.95)
});
```

### Add New Capability
1. Add method to `TwintClient.js`
2. Add SOAP method to `SoapClient.js`
3. Create value objects if needed in `src/values/`
4. Add tests in `test/`

### Debug SOAP Requests
The raw SOAP client is accessible:
```javascript
const rawClient = soapClient.getRawClient();
```

## Code Style Guidelines

### DO
- Use ES modules (`import`/`export`)
- Use private fields (`#fieldName`)
- Use async/await for async operations
- Use built-in Node.js features
- Keep it simple - no build tools

### DON'T
- Don't use TypeScript
- Don't use CommonJS (`require`)
- Don't use build tools/transpilers
- Don't add unnecessary dependencies
- Don't use external test frameworks

## File Naming Conventions
- Source files: `PascalCase.js` (e.g., `TwintClient.js`)
- Test files: `*.test.js`
- Directories: `lowercase`

## Error Handling
All client methods throw errors with descriptive messages:
```javascript
try {
  await client.startOrder(...);
} catch (error) {
  // error.message contains details
}
```

## Security Notes
- Certificates contain sensitive data - never commit them
- Use environment variables for credentials
- The `.gitignore` excludes certificate files (*.p12, *.pem, *.key)

## Quick Reference

### Project Commands
```bash
npm install       # Install dependencies
npm test         # Run tests
npm run dev      # Start dev server
npm run lint     # ESLint check
npm run format   # Prettier format
```

### Key Files
- `src/index.js` - Main exports
- `src/client/TwintClient.js` - Main client class
- `src/soap/SoapClient.js` - SOAP wrapper
- `src/certificates/Certificate.js` - Cert handling
- `dev-server.js` - Development server

### Value Object Methods
- `Money.CHF(amount)` - Create Swiss Francs
- `OrderStatus.IN_PROGRESS()` - Status factory
- `Environment.PRODUCTION` - Environment constant
- `StoreUuid.fromString(uuid)` - UUID creation

## Notes for AI Assistants

1. **This is pure JavaScript** - No TypeScript types or interfaces
2. **ES modules only** - Always use `.js` extension in imports
3. **No compilation** - Code runs directly in Node.js
4. **Private fields** - Use `#` for private class members
5. **SOAP-based** - All API communication is via SOAP/WSDL
6. **Swiss payments** - TWINT is a Swiss payment system, amounts are typically in CHF

When modifying this codebase:
- Maintain ES module syntax
- Keep the no-build philosophy
- Test with `npm test`
- Follow existing patterns in the codebase