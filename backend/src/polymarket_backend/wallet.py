from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal, Sequence

import requests
from pydantic import BaseModel, ConfigDict

DATA_API_BASE = "https://data-api.polymarket.com"
DEFAULT_USER = "0x006BCFa7486Cbe8f85b516Ff559a65E667a4B411"
DEFAULT_HORIZONS = (1, 7, 30)
MAX_ACTIVITY_PAGES = 200


class PolymarketBaseModel(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class Position(PolymarketBaseModel):
    proxyWallet: str
    asset: str
    conditionId: str
    size: float | None = None
    avgPrice: float | None = None
    initialValue: float | None = None
    currentValue: float | None = None
    cashPnl: float | None = None
    percentPnl: float | None = None
    totalBought: float | None = None
    realizedPnl: float | None = None
    percentRealizedPnl: float | None = None
    curPrice: float | None = None
    redeemable: bool | None = None
    mergeable: bool | None = None
    title: str | None = None
    slug: str | None = None
    icon: str | None = None
    eventSlug: str | None = None
    outcome: str | None = None
    outcomeIndex: int | None = None
    oppositeOutcome: str | None = None
    oppositeAsset: str | None = None
    endDate: str | None = None
    negativeRisk: bool | None = None


class ClosedPosition(PolymarketBaseModel):
    proxyWallet: str
    asset: str
    conditionId: str
    avgPrice: float | None = None
    totalBought: float | None = None
    realizedPnl: float | None = None
    curPrice: float | None = None
    timestamp: int | None = None
    title: str | None = None
    slug: str | None = None
    icon: str | None = None
    eventSlug: str | None = None
    outcome: str | None = None
    outcomeIndex: int | None = None
    oppositeOutcome: str | None = None
    oppositeAsset: str | None = None
    endDate: str | None = None


class ActivityEntry(PolymarketBaseModel):
    proxyWallet: str
    timestamp: int
    conditionId: str | None = None
    type: Literal["TRADE", "SPLIT", "MERGE", "REDEEM", "REWARD", "CONVERSION"]
    size: float | None = None
    usdcSize: float | None = None
    transactionHash: str | None = None
    price: float | None = None
    asset: str | None = None
    side: Literal["BUY", "SELL"] | None = None
    outcomeIndex: int | None = None
    title: str | None = None
    slug: str | None = None
    icon: str | None = None
    eventSlug: str | None = None
    outcome: str | None = None

    @property
    def occurred_at(self) -> datetime:
        return datetime.fromtimestamp(self.timestamp, tz=timezone.utc)

    @property
    def size_signed(self) -> float:
        qty = float(self.size or 0)
        if qty == 0:
            return 0.0
        if self.type == "TRADE":
            return qty if self.side == "BUY" else -qty
        if self.type in {"MERGE", "REDEEM"}:
            return -qty
        if self.type == "SPLIT":
            return qty
        return 0.0


class PortfolioPoint(BaseModel):
    date: str
    value: float


class WalletStats(BaseModel):
    total_open_value: float
    total_initial_value: float
    total_unrealized_pnl: float
    total_realized_pnl: float
    open_positions_count: int
    closed_positions_count: int
    activity_start: str
    activity_end: str


class WalletSnapshot(BaseModel):
    user: str
    fetched_at: str
    open_positions: list[Position]
    closed_positions: list[ClosedPosition]
    history: dict[str, list[PortfolioPoint]]
    stats: WalletStats


class PolymarketAPIError(Exception):
    pass


class PolymarketClient:
    def __init__(self, base_url: str = DATA_API_BASE):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()

    def _get(self, path: str, params: dict) -> list[dict]:
        url = f"{self.base_url}{path}"
        try:
            response = self.session.get(url, params=params, timeout=20)
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, list):
                raise PolymarketAPIError("Unexpected response structure")
            return data
        except requests.RequestException as exc:
            raise PolymarketAPIError("Failed to reach Polymarket API") from exc

    def fetch_positions(self, user: str) -> list[Position]:
        data = self._get("/positions", {
            "user": user,
            "limit": 500,
            "sizeThreshold": 0
        })
        return [Position.model_validate(item) for item in data]

    def fetch_closed_positions(self, user: str, limit: int = 50) -> list[ClosedPosition]:
        data = self._get("/closed-positions", {"user": user, "limit": limit})
        return [ClosedPosition.model_validate(item) for item in data]

    def fetch_activity(self, user: str, end: datetime, start: datetime | None = None) -> list[ActivityEntry]:
        params: dict[str, str | int] = {
            "user": user,
            "limit": 500,
            "sortBy": "TIMESTAMP",
            "sortDirection": "DESC",
            "end": int(end.timestamp())
        }
        entries: list[ActivityEntry] = []
        offset = 0
        for _ in range(MAX_ACTIVITY_PAGES):
            page_params = dict(params)
            page_params["offset"] = offset
            data = self._get("/activity", page_params)
            if not data:
                break
            page_entries = [ActivityEntry.model_validate(item) for item in data if item.get("asset")]
            entries.extend(page_entries)
            if len(data) < params["limit"]:
                break
            offset += params["limit"]
        filtered = [entry for entry in entries if start is None or entry.occurred_at >= start]
        filtered.sort(key=lambda e: e.occurred_at)
        return filtered


@dataclass
class PortfolioRebuilder:
    activities: list[ActivityEntry]

    def build_history(self, end_time: datetime, horizons: Sequence[int]) -> dict[str, list[PortfolioPoint]]:
        if not horizons:
            return {}
        horizons = tuple(sorted(horizons))
        max_horizon = horizons[-1]
        start_time = end_time - timedelta(days=max_horizon)
        timeline = self._build_timeline(start_time, end_time)
        values = self._evaluate_timeline(timeline)
        history: dict[str, list[PortfolioPoint]] = {}
        for horizon in horizons:
            cutoff = end_time - timedelta(days=horizon)
            filtered = [point for point in values if point[0] >= cutoff]
            if not filtered and values:
                filtered = values[-1:]
            history[str(horizon)] = [
                PortfolioPoint(date=ts.isoformat(), value=round(val, 6))
                for ts, val in filtered
            ]
        return history

    def _build_timeline(self, start: datetime, end: datetime) -> list[datetime]:
        times = {start, end}
        for activity in self.activities:
            if start <= activity.occurred_at <= end:
                times.add(activity.occurred_at)
        return sorted(times)

    def _evaluate_timeline(self, timeline: list[datetime]) -> list[tuple[datetime, float]]:
        holdings: dict[str, float] = {}
        last_price: dict[str, float] = {}
        results: list[tuple[datetime, float]] = []
        idx = 0
        total = len(self.activities)

        # Apply trades prior to the first timestamp
        while idx < total and self.activities[idx].occurred_at < timeline[0]:
            self._apply_activity(self.activities[idx], holdings, last_price)
            idx += 1

        for ts in timeline:
            while idx < total and self.activities[idx].occurred_at <= ts:
                self._apply_activity(self.activities[idx], holdings, last_price)
                idx += 1
            value = self._portfolio_value(holdings, last_price)
            results.append((ts, value))
        return results

    def _apply_activity(self, activity: ActivityEntry, holdings: dict[str, float], last_price: dict[str, float]) -> None:
        if not activity.asset:
            return
        delta = activity.size_signed
        if delta != 0:
            holdings[activity.asset] = holdings.get(activity.asset, 0.0) + delta
            if abs(holdings[activity.asset]) < 1e-9:
                del holdings[activity.asset]
        if activity.price is not None:
            last_price[activity.asset] = float(activity.price)

    @staticmethod
    def _portfolio_value(holdings: dict[str, float], last_price: dict[str, float]) -> float:
        total = 0.0
        for token, qty in holdings.items():
            price = last_price.get(token)
            if price is None:
                continue
            total += qty * price
        return float(round(total, 6))


class PolymarketWalletService:
    def __init__(self, client: PolymarketClient | None = None):
        self.client = client or PolymarketClient()

    def get_wallet_snapshot(
        self,
        user: str | None = None,
        horizons: Sequence[int] = DEFAULT_HORIZONS,
    ) -> WalletSnapshot:
        user_addr = user or DEFAULT_USER
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(days=max(horizons or DEFAULT_HORIZONS))

        open_positions = self.client.fetch_positions(user_addr)
        closed_positions = self.client.fetch_closed_positions(user_addr)
        activities = self.client.fetch_activity(user_addr, end=now, start=window_start - timedelta(days=30))

        history = PortfolioRebuilder(activities).build_history(now, horizons)
        stats = self._compute_stats(open_positions, closed_positions, window_start, now)

        return WalletSnapshot(
            user=user_addr,
            fetched_at=now.isoformat(),
            open_positions=open_positions,
            closed_positions=closed_positions,
            history=history,
            stats=stats,
        )

    def _compute_stats(
        self,
        open_positions: list[Position],
        closed_positions: list[ClosedPosition],
        start: datetime,
        end: datetime,
    ) -> WalletStats:
        total_open_value = sum(p.currentValue or 0 for p in open_positions)
        total_initial_value = sum(p.initialValue or 0 for p in open_positions)
        total_unrealized = sum(p.cashPnl or 0 for p in open_positions)
        total_realized = sum(p.realizedPnl or 0 for p in closed_positions)
        return WalletStats(
            total_open_value=float(total_open_value),
            total_initial_value=float(total_initial_value),
            total_unrealized_pnl=float(total_unrealized),
            total_realized_pnl=float(total_realized),
            open_positions_count=len(open_positions),
            closed_positions_count=len(closed_positions),
            activity_start=start.isoformat(),
            activity_end=end.isoformat(),
        )
