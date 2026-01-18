# Donut Browser API Specification

The Donut Browser is a service that provides unified access to exchange APIs for the Donut CLI trading terminal.

## Base Configuration

```
Base URL: ${DONUT_BROWSER_URL}  (e.g., http://localhost:3000)
Auth: Bearer token via Authorization header
Content-Type: application/json
```

## Authentication

All requests require authentication:

```
Authorization: Bearer <api_token>
```

Token is configured via `DONUT_BROWSER_TOKEN` environment variable.

---

## Endpoints

### Health Check

```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "exchange": "binance",
  "connected": true,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

### Wallet

#### Get Wallet Overview

```
GET /wallet
```

**Response:**
```json
{
  "totalEquity": 15432.50,
  "availableBalance": 8000.00,
  "usedMargin": 7432.50,
  "unrealizedPnl": 234.75,
  "marginLevel": 2.08,
  "currency": "USDT"
}
```

#### Get Balances

```
GET /balances
```

**Response:**
```json
{
  "balances": [
    {
      "asset": "USDT",
      "free": 8000.00,
      "locked": 7432.50,
      "total": 15432.50
    },
    {
      "asset": "BTC",
      "free": 0.0,
      "locked": 0.0,
      "total": 0.0
    }
  ]
}
```

---

### Positions

#### List Open Positions

```
GET /positions
```

**Response:**
```json
{
  "positions": [
    {
      "symbol": "BTCUSDT",
      "side": "long",
      "quantity": 0.5,
      "entryPrice": 45000.00,
      "currentPrice": 45500.00,
      "unrealizedPnl": 250.00,
      "unrealizedPnlPct": 1.11,
      "leverage": 10,
      "margin": 2250.00,
      "liquidationPrice": 40500.00,
      "openTime": 1705312200
    }
  ]
}
```

#### Get Position by Symbol

```
GET /positions/:symbol
```

**Response:**
```json
{
  "position": {
    "symbol": "BTCUSDT",
    "side": "long",
    "quantity": 0.5,
    "entryPrice": 45000.00,
    "currentPrice": 45500.00,
    "unrealizedPnl": 250.00,
    "unrealizedPnlPct": 1.11,
    "leverage": 10,
    "margin": 2250.00,
    "liquidationPrice": 40500.00,
    "openTime": 1705312200
  }
}
```

---

### Orders

#### Preview Trade

Calculates expected execution without placing order.

```
POST /orders/preview
```

**Request:**
```json
{
  "symbol": "BTCUSDT",
  "side": "long",
  "quantity": 0.1,
  "leverage": 10,
  "orderType": "market"
}
```

**Response:**
```json
{
  "symbol": "BTCUSDT",
  "side": "long",
  "quantity": 0.1,
  "estimatedPrice": 45500.00,
  "estimatedCost": 455.00,
  "estimatedFee": 1.82,
  "margin": 455.00,
  "liquidationPrice": 40950.00,
  "leverage": 10,
  "valid": true,
  "warnings": []
}
```

#### Execute Trade

```
POST /orders/execute
```

**Request:**
```json
{
  "symbol": "BTCUSDT",
  "side": "long",
  "quantity": 0.1,
  "leverage": 10,
  "orderType": "market",
  "stopLoss": 44000.00,
  "takeProfit": 48000.00,
  "clientOrderId": "donut_12345"
}
```

**Response:**
```json
{
  "orderId": "8389765",
  "clientOrderId": "donut_12345",
  "symbol": "BTCUSDT",
  "side": "long",
  "quantity": 0.1,
  "executedPrice": 45500.00,
  "fee": 1.82,
  "status": "filled",
  "timestamp": 1705312500,
  "stopLossOrderId": "8389766",
  "takeProfitOrderId": "8389767"
}
```

**Order Status Values:**
- `pending` - Order submitted, awaiting execution
- `filled` - Fully executed
- `partial` - Partially filled
- `cancelled` - Cancelled by user or system
- `failed` - Execution failed

#### Modify Position

```
PATCH /positions/:symbol
```

**Request:**
```json
{
  "action": "modify",
  "stopLoss": 43500.00,
  "takeProfit": 49000.00
}
```

**Response:**
```json
{
  "success": true,
  "symbol": "BTCUSDT",
  "stopLoss": 43500.00,
  "takeProfit": 49000.00,
  "message": "Position modified"
}
```

#### Close Position

```
DELETE /positions/:symbol
```

**Query params:**
- `quantity` (optional) - Partial close amount. If omitted, closes entire position.

**Response:**
```json
{
  "orderId": "8389770",
  "symbol": "BTCUSDT",
  "side": "short",
  "quantity": 0.1,
  "executedPrice": 45600.00,
  "fee": 1.82,
  "realizedPnl": 8.18,
  "status": "filled",
  "timestamp": 1705312800
}
```

#### Close All Positions

```
DELETE /positions
```

**Response:**
```json
{
  "closedPositions": [
    {
      "symbol": "BTCUSDT",
      "realizedPnl": 8.18,
      "status": "filled"
    },
    {
      "symbol": "ETHUSDT",
      "realizedPnl": -12.50,
      "status": "filled"
    }
  ],
  "totalRealizedPnl": -4.32
}
```

#### Cancel Order

```
DELETE /orders/:orderId
```

**Response:**
```json
{
  "orderId": "8389766",
  "status": "cancelled",
  "message": "Order cancelled successfully"
}
```

---

### Transactions

#### Get Transaction Status

```
GET /transactions/:orderId
```

**Response:**
```json
{
  "orderId": "8389765",
  "clientOrderId": "donut_12345",
  "symbol": "BTCUSDT",
  "status": "filled",
  "side": "long",
  "quantity": 0.1,
  "executedQuantity": 0.1,
  "executedPrice": 45500.00,
  "fee": 1.82,
  "timestamp": 1705312500,
  "fills": [
    {
      "price": 45500.00,
      "quantity": 0.1,
      "fee": 1.82,
      "timestamp": 1705312500
    }
  ]
}
```

---

### Market Data

#### Get Current Price

```
GET /prices/:symbol
```

**Response:**
```json
{
  "symbol": "BTCUSDT",
  "price": 45500.00,
  "bid": 45499.50,
  "ask": 45500.50,
  "timestamp": 1705312900
}
```

#### Get Order Book

```
GET /orderbook/:symbol
```

**Query params:**
- `limit` (optional) - Number of levels (default: 10, max: 100)

**Response:**
```json
{
  "symbol": "BTCUSDT",
  "bids": [
    [45499.50, 1.5],
    [45499.00, 2.3]
  ],
  "asks": [
    [45500.50, 1.2],
    [45501.00, 1.8]
  ],
  "timestamp": 1705312900
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Not enough balance to execute trade",
    "details": {
      "required": 500.00,
      "available": 450.00
    }
  }
}
```

**Error Codes:**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing auth token |
| `FORBIDDEN` | 403 | Operation not permitted |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `INSUFFICIENT_BALANCE` | 400 | Not enough balance |
| `POSITION_NOT_FOUND` | 404 | No position for symbol |
| `ORDER_REJECTED` | 400 | Exchange rejected order |
| `RATE_LIMITED` | 429 | Too many requests |
| `EXCHANGE_ERROR` | 502 | Exchange API error |
| `INTERNAL_ERROR` | 500 | Internal server error |

---

## Rate Limits

- **Read endpoints:** 100 requests/minute
- **Write endpoints:** 30 requests/minute
- **Market data:** 200 requests/minute

Rate limit headers are included in all responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705313000
```

---

## WebSocket (Future)

```
WS /ws
```

Subscribe to real-time updates:

```json
{
  "action": "subscribe",
  "channels": ["positions", "orders", "prices:BTCUSDT"]
}
```

---

## Implementation Notes

1. **Idempotency:** Use `clientOrderId` for order deduplication
2. **Timestamps:** All Unix timestamps are in seconds
3. **Quantities:** All quantities use exchange precision (e.g., 3 decimals for BTC)
4. **Prices:** All prices are in USDT
5. **Leverage:** Must be set before position is opened
