import { AlertTriangle, ExternalLink, LineChart, Loader2, RefreshCcw, ShieldCheck, Sparkles, Wallet2 } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import type { PolymarketClosedPosition, PolymarketPosition, PolymarketWalletSnapshot } from '../api'
import { apiService } from '../api'
import { cn } from '../lib/utils'
import { VisxLineChart } from './ui/visx-line-chart'

const DEFAULT_POLYMARKET_USER = '0x006BCFa7486Cbe8f85b516Ff559a65E667a4B411'
const CHART_BASELINE = 110 // arbitrary denominator to express returns in %

const HORIZON_OPTIONS = [
  { label: '1D', value: 1 },
  { label: '1W', value: 7 },
  { label: '1M', value: 30 }
]

const frostPanel = 'bg-white/5 backdrop-blur-2xl border border-white/10 shadow-[0_20px_60px_rgba(15,23,42,0.35)]'

const polymarketBaseUrl = 'https://polymarket.com'

export function PolymarketPage() {
  const queryParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const addressFromQuery = queryParams.get('user')
  const walletAddress = (addressFromQuery && /^0x[a-fA-F0-9]{40}$/.test(addressFromQuery))
    ? addressFromQuery
    : DEFAULT_POLYMARKET_USER

  const [wallet, setWallet] = useState<PolymarketWalletSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [horizonIndex, setHorizonIndex] = useState(2)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiService.getWallet({
      user: walletAddress,
      horizons: HORIZON_OPTIONS.map(option => option.value)
    })
      .then(data => {
        if (cancelled) return
        setWallet(data)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Unable to load Polymarket wallet data'
        setError(message)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [walletAddress])

  const selectedHorizon = HORIZON_OPTIONS[horizonIndex] ?? HORIZON_OPTIONS[HORIZON_OPTIONS.length - 1]
  const selectedHistoryKey = selectedHorizon ? String(selectedHorizon.value) : String(HORIZON_OPTIONS[0].value)
  const chartHistory = wallet?.history?.[selectedHistoryKey] ?? []
  const sortedHistory = useMemo(() => {
    if (!chartHistory.length) return []
    return [...chartHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [chartHistory])
  const normalizedHistory = useMemo(() => {
    if (!sortedHistory.length) return []
    return sortedHistory.map(point => ({
      date: point.date,
      value: (point.value - CHART_BASELINE) / CHART_BASELINE
    }))
  }, [sortedHistory])
  const chartSeries = useMemo(() => (
    normalizedHistory.length
      ? [{ dataKey: 'portfolio', data: normalizedHistory, stroke: '#7dd3fc', name: 'Portfolio Value' }]
      : []
  ), [normalizedHistory])

  const chartDelta = useMemo(() => {
    if (!sortedHistory.length) return { absolute: 0, percent: 0 }
    const firstValue = sortedHistory[0].value
    const lastValue = sortedHistory[sortedHistory.length - 1].value
    const absolute = lastValue - firstValue
    const percent = ((lastValue - firstValue) / CHART_BASELINE) * 100
    return { absolute, percent }
  }, [sortedHistory])

  const stats = wallet?.stats
  const rawOpenPositions = wallet?.open_positions ?? []
  const openPositions = useMemo(() => {
    return rawOpenPositions.filter((position) => {
      const value = Number(position.currentValue ?? 0)
      const rounded = Math.round(value * 100) / 100
      return Math.abs(rounded) >= 0.01
    })
  }, [rawOpenPositions])
  const closedPositions = wallet?.closed_positions ?? []

  const portfolioUrl = `${polymarketBaseUrl}/@aubanel`

  const renderHero = () => (
    <section className={cn('relative overflow-hidden rounded-3xl p-8 md:p-12 text-white', frostPanel)}>
      <div className="absolute inset-0 bg-gradient-to-r from-sky-500/20 via-transparent to-indigo-500/10" aria-hidden="true"></div>
      <div className="relative flex flex-col lg:flex-row gap-10">
        <div className="flex-1 space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs uppercase tracking-[0.2em]">
            <Sparkles className="h-4 w-4" /> Polymarket Wallet
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Deep dive into our Polymarket wallet</h1>
            <p className="mt-3 text-white/80 max-w-2xl">
              Live positions, realized gains, and reconstructed portfolio value for our flagship on-chain wallet.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-4 py-2">
              <Wallet2 className="h-5 w-5 text-sky-300" />
              <div className="font-mono text-base">{shortenAddress(walletAddress)}</div>
            </div>
            {wallet?.fetched_at && (
              <div className="flex items-center gap-2 text-white/70">
                <RefreshCcw className="h-4 w-4" />
                <span>Updated {formatRelative(wallet?.fetched_at)}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-4">
            <a
              href={portfolioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white/20 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-cyan-500/30 transition hover:bg-white/30"
            >
              View on Polymarket <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
        <div className="w-full max-w-md">
          <div className={cn('rounded-2xl p-6 space-y-6 text-sm text-white/80', frostPanel)}>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">Portfolio Value</p>
              <div className="text-3xl font-semibold text-white mt-1">{formatCurrency(stats?.total_open_value)}</div>
              <div className={cn('text-sm mt-1 flex items-center gap-2', chartDelta.absolute >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                <TrendingBadge delta={chartDelta} horizonLabel={selectedHorizon.label} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <StatHighlight label="Unrealized PnL" value={formatCurrency(stats?.total_unrealized_pnl)} positive={(stats?.total_unrealized_pnl ?? 0) >= 0} />
              <StatHighlight label="Realized PnL" value={formatCurrency(stats?.total_realized_pnl)} positive={(stats?.total_realized_pnl ?? 0) >= 0} />
              <StatHighlight label="Open Positions" value={openPositions.length.toString()} />
              <StatHighlight label="Closed Positions" value={closedPositions.length.toString()} />
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
              <ShieldCheck className="h-10 w-10 text-white" />
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-white/60">Address secured</p>
                <p className="text-sm">Tracked through PrediBench on-chain wallet analytics.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-slate-950 via-slate-950 to-background text-white">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-sky-500/30 blur-[160px]" aria-hidden="true"></div>
      <div className="relative container mx-auto px-4 py-10 space-y-12">
        {error && (
          <div className={cn('rounded-3xl border border-red-500/40 bg-red-500/10 p-6 text-red-100', frostPanel)}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <p className="font-medium">Failed to fetch Polymarket data</p>
                <p className="text-sm text-red-100/80">{error}</p>
              </div>
            </div>
          </div>
        )}

        {renderHero()}

        <section className={cn('rounded-3xl p-6 lg:p-8 space-y-6', frostPanel)}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                <LineChart className="h-6 w-6 text-sky-300" /> Value Curve
              </h2>
              <p className="text-white/70 text-sm">Reconstructed using on-chain fills and price histories.</p>
            </div>
            <div className="flex flex-col gap-2 w-full md:w-64">
              <input
                type="range"
                min={0}
                max={HORIZON_OPTIONS.length - 1}
                value={horizonIndex}
                onChange={(event) => setHorizonIndex(Number(event.target.value))}
                className="accent-sky-400"
              />
              <div className="flex justify-between text-[11px] uppercase tracking-[0.3em] text-white/60">
                {HORIZON_OPTIONS.map((option, idx) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn('transition', idx === horizonIndex ? 'text-white' : 'text-white/50')}
                    onClick={() => setHorizonIndex(idx)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="h-[420px]">
            {loading && !wallet ? (
              <div className="h-full flex items-center justify-center text-white/70">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : chartSeries.length ? (
              <VisxLineChart
                height={380}
                series={chartSeries}
                showGrid
                numTicks={5}
                formatTooltipX={(value) => value.toLocaleString()}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-white/60">
                <LineChart className="h-10 w-10 mb-2" />
                <p>No activity in this horizon window.</p>
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Open Positions</h3>
              <span className="text-sm text-white/60">{openPositions.length} markets</span>
            </div>
            {loading && !wallet ? (
              <SkeletonRows rows={2} />
            ) : openPositions.length ? (
              <div className="space-y-5">
                {openPositions.map((position) => (
                  <PositionCard key={`${position.asset}-${position.slug}`} position={position} />
                ))}
              </div>
            ) : (
              <EmptyState message="No open positions at the moment." />
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Closed Positions</h3>
              <span className="text-sm text-white/60">{closedPositions.length} entries</span>
            </div>
            {loading && !wallet ? (
              <SkeletonRows rows={2} />
            ) : closedPositions.length ? (
              <div className="space-y-4">
                {closedPositions.map((position) => (
                  <ClosedPositionCard key={`${position.asset}-${position.timestamp}`} position={position} />
                ))}
              </div>
            ) : (
              <EmptyState message="No closed positions recorded in this window." />
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function StatHighlight({ label, value, positive = true }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-2xl bg-white/5 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.3em] text-white/60">{label}</p>
      <p className={cn('text-lg font-semibold', positive ? 'text-emerald-300' : 'text-rose-300')}>{value}</p>
    </div>
  )
}

function TrendingBadge({ delta, horizonLabel }: { delta: { absolute: number; percent: number }; horizonLabel: string }) {
  const positive = delta.absolute >= 0
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      {positive ? <Sparkles className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      {positive ? '+' : ''}{formatCurrency(delta.absolute)} ({formatPercent(delta.percent)}) in {horizonLabel}
    </span>
  )
}

function PositionCard({ position }: { position: PolymarketPosition }) {
  const priceUrl = position.slug && position.eventSlug ? `${polymarketBaseUrl}/${position.eventSlug}/${position.slug}` : undefined
  const pnl = position.cashPnl ?? 0
  const pnlPercent = position.percentPnl ?? position.percentRealizedPnl
  return (
    <article className={cn('rounded-3xl p-6 text-white space-y-5 transition hover:-translate-y-0.5', frostPanel)}>
      <div className="flex items-start gap-4">
        {position.icon ? (
          <img src={position.icon} alt="" className="h-14 w-14 rounded-2xl border border-white/20 object-cover" />
        ) : (
          <div className="h-14 w-14 rounded-2xl bg-slate-900/60 flex items-center justify-center text-lg font-semibold">
            {(position.outcome || position.title || '?').slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-semibold leading-tight">
              {position.title ?? 'Unknown market'}
            </h4>
            {position.redeemable && <Badge>Redeemable</Badge>}
            {position.mergeable && <Badge>Mergeable</Badge>}
            {position.negativeRisk && <Badge>Neg. Risk</Badge>}
          </div>
          <p className="text-sm text-white/70">
            {position.outcome ?? 'Outcome'} • {formatCurrency(position.currentValue)}
          </p>
        </div>
        {priceUrl && (
          <a href={priceUrl} target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-white">
            <ExternalLink className="h-5 w-5" />
          </a>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <StatItem label="Position Size" value={`${formatNumber(position.size)} shares`} />
        <StatItem label="Avg Price" value={formatPercent((position.avgPrice ?? 0) * 100)} />
        <StatItem label="Cur Price" value={formatPercent((position.curPrice ?? 0) * 100)} />
        <StatItem label="Initial Value" value={formatCurrency(position.initialValue)} />
      </dl>
      <div className="flex items-center justify-between text-sm font-medium">
        <span className="text-white/70">Cash PnL</span>
        <span className={cn('text-lg font-semibold', pnl >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
          {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)} {pnlPercent != null && `(${formatPercent(pnlPercent)})`}
        </span>
      </div>
    </article>
  )
}

function ClosedPositionCard({ position }: { position: PolymarketClosedPosition }) {
  const resolvedAt = position.timestamp ? formatRelative(position.timestamp * 1000) : 'Recently'
  const pnl = position.realizedPnl ?? 0
  const badgeColor = pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'
  return (
    <article className={cn('rounded-3xl p-5 space-y-3', frostPanel)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-white">{position.title ?? 'Closed market'}</p>
          <p className="text-sm text-white/60">{position.outcome ?? 'Outcome'} — {resolvedAt}</p>
        </div>
        <div className={cn('text-lg font-semibold', badgeColor)}>
          {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-4 text-sm text-white/80">
        <StatItem label="Avg Price" value={formatPercent((position.avgPrice ?? 0) * 100)} />
        <StatItem label="Total Bought" value={`${formatNumber(position.totalBought)} shares`} />
      </dl>
    </article>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-white/50 uppercase tracking-[0.2em]">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  )
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/20 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-white/70">
      {children}
    </span>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className={cn('rounded-3xl p-6 text-center text-white/70', frostPanel)}>
      <p>{message}</p>
    </div>
  )
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className={cn('h-32 animate-pulse rounded-3xl bg-white/5')} />
      ))}
    </div>
  )
}

function formatCurrency(value: number | undefined | null, minimumFractionDigits = 2): string {
  const safe = typeof value === 'number' ? value : 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits,
    maximumFractionDigits: minimumFractionDigits,
  }).format(safe)
}

function formatPercent(value: number | undefined | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function formatNumber(value: number | undefined | null): string {
  if (!value) return '0'
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`
  return value.toFixed(2)
}

function shortenAddress(address: string): string {
  if (!address) return ''
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function formatRelative(dateLike: string | number): string {
  const date = typeof dateLike === 'number' ? new Date(dateLike) : new Date(dateLike)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
