import { AlertTriangle, ExternalLink, LineChart, Loader2, RefreshCcw, ShieldCheck, Sparkles, Wallet2 } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import type { PolymarketClosedPosition, PolymarketPosition, PolymarketWalletSnapshot } from '../api'
import { DEFAULT_HORIZONS, DEFAULT_POLYMARKET_USER, fetchWalletSnapshot } from '../api'
import { cn } from '../lib/utils'
import { VisxLineChart } from './ui/visx-line-chart'

const frostPanel = 'bg-white/5 backdrop-blur-2xl border border-white/10 shadow-[0_20px_60px_rgba(15,23,42,0.35)]'

const polymarketBaseUrl = 'https://polymarket.com'
const DIRECT_PNL_API = 'https://user-pnl-api.polymarket.com/user-pnl'
const DIRECT_PNL_INTERVAL = '1m'
const DIRECT_PNL_FIDELITY = '1d'
const PNL_VIEW_OPTIONS = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: 'ALL', days: null }
]

type DirectPnlPoint = { t: number; p: number }

export function PolymarketPage() {
  const queryParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const addressFromQuery = queryParams.get('user')
  const walletAddress = (addressFromQuery && /^0x[a-fA-F0-9]{40}$/.test(addressFromQuery))
    ? addressFromQuery
    : DEFAULT_POLYMARKET_USER

  const [wallet, setWallet] = useState<PolymarketWalletSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pnlHistory, setPnlHistory] = useState<DirectPnlPoint[] | null>(null)
  const [pnlLoading, setPnlLoading] = useState(false)
  const [pnlError, setPnlError] = useState<string | null>(null)
  const [pnlViewIndex, setPnlViewIndex] = useState(PNL_VIEW_OPTIONS.length - 1)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchWalletSnapshot({
      user: walletAddress,
      horizons: Array.from(DEFAULT_HORIZONS)
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

  useEffect(() => {
    let cancelled = false
    setPnlLoading(true)
    setPnlError(null)
    setPnlHistory(null)
    const params = new URLSearchParams({
      user_address: walletAddress,
      interval: DIRECT_PNL_INTERVAL,
      fidelity: DIRECT_PNL_FIDELITY
    })
    fetch(`${DIRECT_PNL_API}?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Direct PnL API failed (${response.status})`)
        }
        return await response.json()
      })
      .then((data: unknown) => {
        if (cancelled) return
        setPnlHistory(Array.isArray(data) ? data as DirectPnlPoint[] : [])
        setPnlLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Unable to load direct PnL history'
        setPnlError(message)
        setPnlLoading(false)
      })
    return () => { cancelled = true }
  }, [walletAddress])

  const selectedPnlView = PNL_VIEW_OPTIONS[pnlViewIndex] ?? PNL_VIEW_OPTIONS[PNL_VIEW_OPTIONS.length - 1]

  const directPnlSeries = useMemo(() => {
    if (!pnlHistory?.length) return []
    const sortedPoints = [...pnlHistory]
      .sort((a, b) => a.t - b.t)
      .map((point) => ({
        date: new Date(point.t * 1000).toISOString(),
        value: point.p
      }))
    let filteredPoints = sortedPoints
    if (selectedPnlView.days != null) {
      const cutoff = Date.now() - selectedPnlView.days * 24 * 60 * 60 * 1000
      filteredPoints = sortedPoints.filter((point) => new Date(point.date).getTime() >= cutoff)
      if (filteredPoints.length === 0) {
        filteredPoints = sortedPoints.slice(-1)
      }
    }
    return [{
      dataKey: 'directPnl',
      data: filteredPoints,
      stroke: '#fbbf24',
      name: 'Net PnL'
    }]
  }, [pnlHistory, selectedPnlView])

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
  const sortedClosedPositions = useMemo(() => {
    return [...closedPositions].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
  }, [closedPositions])

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
            <a
              href="#direct-pnl"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10"
            >
              View Net PnL
            </a>
          </div>
        </div>
        <div className="w-full max-w-md">
          <div className={cn('rounded-2xl p-6 space-y-6 text-sm text-white/80', frostPanel)}>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">Portfolio Value</p>
              <div className="text-3xl font-semibold text-white mt-1">{formatCurrency(stats?.total_open_value)}</div>
              <div className={cn('text-sm mt-1 flex items-center gap-2', (stats?.total_unrealized_pnl ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                {(stats?.total_unrealized_pnl ?? 0) >= 0 ? '+' : ''}{formatCurrency(stats?.total_unrealized_pnl ?? 0)}
                <span className="text-white/60 text-[11px] uppercase tracking-[0.3em]">Unrealized PnL</span>
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

        <section id="direct-pnl" className={cn('rounded-3xl p-6 lg:p-8 space-y-6', frostPanel)}>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                <LineChart className="h-6 w-6 text-amber-300" /> Net PnL
              </h2>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-[0.3em] text-white/60">Range</span>
              <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
                {PNL_VIEW_OPTIONS.map((option, idx) => {
                  const active = idx === pnlViewIndex
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setPnlViewIndex(idx)}
                      className={cn(
                        'px-4 py-1 text-sm font-medium rounded-full transition',
                        active ? 'bg-white text-slate-900 shadow' : 'text-white/70 hover:text-white'
                      )}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="h-[360px]">
            {pnlLoading ? (
              <div className="h-full flex items-center justify-center text-white/70">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : pnlError ? (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
                {pnlError}
              </div>
            ) : directPnlSeries.length ? (
              <VisxLineChart
                height={320}
                series={directPnlSeries}
                showGrid
                numTicks={5}
                formatTooltipX={(value) => value.toLocaleDateString()}
                yTickFormat={(value) => formatCurrency(value)}
                tooltipValueFormatter={(value) => formatCurrency(value)}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-white/60">
                <LineChart className="h-10 w-10 mb-2" />
                <p>No direct PnL data returned for this address.</p>
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
              <span className="text-sm text-white/60">{sortedClosedPositions.length} entries</span>
            </div>
            {loading && !wallet ? (
              <SkeletonRows rows={2} />
            ) : sortedClosedPositions.length ? (
              <div className="space-y-4">
                {sortedClosedPositions.map((position) => (
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

function PositionCard({ position }: { position: PolymarketPosition }) {
  const priceUrl = position.slug && position.eventSlug ? `${polymarketBaseUrl}/${position.eventSlug}/${position.slug}` : undefined
  const pnl = position.cashPnl ?? 0
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
          {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
        </span>
      </div>
    </article>
  )
}

function ClosedPositionCard({ position }: { position: PolymarketClosedPosition }) {
  const resolvedAt = position.timestamp ? formatRelative(position.timestamp * 1000, { hoursToDaySwitch: 48 }) : 'Recently'
  const pnl = position.realizedPnl ?? 0
  const badgeColor = pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'
  const tradeSummaryParts: string[] = []
  if (position.totalBought) {
    tradeSummaryParts.push(`${formatNumber(position.totalBought)} ${position.outcome ?? 'shares'}`)
  } else if (position.outcome) {
    tradeSummaryParts.push(position.outcome)
  }
  tradeSummaryParts.push(`at ${formatCents(position.avgPrice)}`)
  const tradeSummary = tradeSummaryParts.filter(Boolean).join(' ')
  return (
    <article className={cn('rounded-3xl p-5', frostPanel)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4 flex-1">
          {position.icon ? (
            <img src={position.icon} alt="" className="h-14 w-14 rounded-2xl border border-white/20 object-cover" />
          ) : (
            <div className="h-14 w-14 rounded-2xl bg-slate-900/60 flex items-center justify-center text-lg font-semibold">
              {(position.outcome || position.title || '?').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold text-white">{position.title ?? 'Closed market'}</p>
            <p className="text-sm text-white/60">{tradeSummary}</p>
          </div>
        </div>
        <div className="text-right">
          <div className={cn('text-lg font-semibold', badgeColor)}>
            {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
          </div>
          <p className="text-xs text-white/60">{resolvedAt}</p>
        </div>
      </div>
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
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatCents(price: number | undefined | null): string {
  if (price === null || price === undefined || Number.isNaN(Number(price))) return '—'
  const cents = Number(price) * 100
  const precision = Math.abs(cents % 1) < 1e-9 ? 0 : 2
  return `${cents.toFixed(precision)}¢`
}

function shortenAddress(address: string): string {
  if (!address) return ''
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function formatRelative(dateLike: string | number, options?: { hoursToDaySwitch?: number }): string {
  const date = typeof dateLike === 'number' ? new Date(dateLike) : new Date(dateLike)
  if (Number.isNaN(date.getTime())) return '—'
  const diffMs = Date.now() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  if (diffSeconds < 60) return 'just now'
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`
  const diffHours = Math.floor(diffMinutes / 60)
  const hourThreshold = options?.hoursToDaySwitch ?? 24
  if (diffHours < hourThreshold) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}
