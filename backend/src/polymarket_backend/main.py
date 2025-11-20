from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .wallet import DEFAULT_HORIZONS, PolymarketAPIError, PolymarketWalletService, WalletSnapshot

app = FastAPI(title="Polymarket Wallet API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

wallet_service = PolymarketWalletService()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/wallet", response_model=WalletSnapshot)
def get_wallet(user: str | None = None, horizons: str | None = None) -> WalletSnapshot:
    try:
        parsed_horizons = _parse_horizons(horizons)
        return wallet_service.get_wallet_snapshot(user=user, horizons=parsed_horizons)
    except PolymarketAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def _parse_horizons(raw: str | None) -> tuple[int, ...]:
    if not raw:
        return DEFAULT_HORIZONS
    items: list[int] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            value = int(part)
            if value <= 0:
                raise ValueError
            items.append(value)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid horizons parameter") from exc
    return tuple(items or DEFAULT_HORIZONS)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8081)
