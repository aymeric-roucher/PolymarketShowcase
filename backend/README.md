# Polymarket Wallet Backend

Minimal FastAPI service that aggregates data from the public Polymarket data API
and reconstructs a wallet snapshot (open positions, closed positions and a
portfolio history for 1D/1W/1M horizons).

## Running locally

```
uv sync  # or pip install -r requirements
uv run uvicorn polymarket_backend.main:app --reload --port 8081
```

Then hit `http://localhost:8081/api/wallet` to retrieve the snapshot for the
default wallet (`0x006BCFa7486Cbe8f85b516Ff559a65E667a4B411`). Pass `?user=`
and `?horizons=` query parameters to override the address or horizons if needed.
