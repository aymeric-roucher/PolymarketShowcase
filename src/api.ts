const DATA_API_BASE = 'https://data-api.polymarket.com'
export const DEFAULT_POLYMARKET_USER = '0x006BCFa7486Cbe8f85b516Ff559a65E667a4B411'
export const DEFAULT_HORIZONS = [1, 7, 30] as const

const MAX_ACTIVITY_PAGES = 200
const ACTIVITY_PAGE_SIZE = 500
const DAY_MS = 24 * 60 * 60 * 1000

export interface PolymarketPosition {
  proxyWallet: string
  asset: string
  conditionId: string
  size?: number
  avgPrice?: number
  initialValue?: number
  currentValue?: number
  cashPnl?: number
  percentPnl?: number
  totalBought?: number
  realizedPnl?: number
  percentRealizedPnl?: number
  curPrice?: number
  redeemable?: boolean
  mergeable?: boolean
  title?: string
  slug?: string
  icon?: string
  eventSlug?: string
  outcome?: string
  outcomeIndex?: number
  oppositeOutcome?: string
  oppositeAsset?: string
  endDate?: string
  negativeRisk?: boolean
}

export interface PolymarketClosedPosition {
  proxyWallet: string
  asset: string
  conditionId: string
  avgPrice?: number
  totalBought?: number
  realizedPnl?: number
  curPrice?: number
  timestamp?: number
  title?: string
  slug?: string
  icon?: string
  eventSlug?: string
  outcome?: string
  outcomeIndex?: number
  oppositeOutcome?: string
  oppositeAsset?: string
  endDate?: string
}

type ActivityType = 'TRADE' | 'SPLIT' | 'MERGE' | 'REDEEM' | 'REWARD' | 'CONVERSION'

interface ActivityEntry {
  proxyWallet: string
  timestamp: number
  conditionId?: string
  type: ActivityType
  size?: number
  usdcSize?: number
  transactionHash?: string
  price?: number
  asset?: string
  side?: 'BUY' | 'SELL'
  outcomeIndex?: number
  title?: string
  slug?: string
  icon?: string
  eventSlug?: string
  outcome?: string
}

export interface PortfolioPoint {
  date: string
  value: number
}

export interface PolymarketWalletStats {
  total_open_value: number
  total_initial_value: number
  total_unrealized_pnl: number
  total_realized_pnl: number
  open_positions_count: number
  closed_positions_count: number
  activity_start: string
  activity_end: string
}

export interface PolymarketWalletSnapshot {
  user: string
  fetched_at: string
  open_positions: PolymarketPosition[]
  closed_positions: PolymarketClosedPosition[]
  history: Record<string, PortfolioPoint[]>
  stats: PolymarketWalletStats
}

interface WalletFetchOptions {
  user?: string
  horizons?: number[]
}

export async function fetchWalletSnapshot(options: WalletFetchOptions = {}): Promise<PolymarketWalletSnapshot> {
  const userAddress = options.user ?? DEFAULT_POLYMARKET_USER
  const horizons = options.horizons && options.horizons.length ? options.horizons : [...DEFAULT_HORIZONS]
  const now = new Date()
  const maxHorizon = Math.max(...horizons)
  const windowStart = new Date(now.getTime() - maxHorizon * DAY_MS)

  const [openPositions, closedPositions, activities] = await Promise.all([
    fetchPositions(userAddress),
    fetchClosedPositions(userAddress),
    fetchActivity(userAddress, now)
  ])

  const history = buildHistory(activities, horizons, now)
  const stats = computeStats(openPositions, closedPositions, windowStart, now)

  return {
    user: userAddress,
    fetched_at: now.toISOString(),
    open_positions: openPositions,
    closed_positions: closedPositions,
    history,
    stats
  }
}

async function fetchPositions(user: string): Promise<PolymarketPosition[]> {
  return await fetchFromDataApi<PolymarketPosition[]>('/positions', {
    user,
    limit: 500,
    sizeThreshold: 0
  })
}

async function fetchClosedPositions(user: string, limit = 50): Promise<PolymarketClosedPosition[]> {
  return await fetchFromDataApi<PolymarketClosedPosition[]>('/closed-positions', {
    user,
    limit
  })
}

async function fetchActivity(user: string, end: Date): Promise<ActivityEntry[]> {
  const params: Record<string, string | number> = {
    user,
    limit: ACTIVITY_PAGE_SIZE,
    sortBy: 'TIMESTAMP',
    sortDirection: 'DESC',
    end: Math.floor(end.getTime() / 1000)
  }

  const entries: ActivityEntry[] = []
  let offset = 0
  for (let page = 0; page < MAX_ACTIVITY_PAGES; page++) {
    const data = await fetchFromDataApi<ActivityEntry[]>('/activity', { ...params, offset })
    if (!Array.isArray(data) || data.length === 0) break
    for (const item of data) {
      if (item?.asset) {
        entries.push(item)
      }
    }
    if (data.length < ACTIVITY_PAGE_SIZE) break
    offset += ACTIVITY_PAGE_SIZE
  }
  entries.sort((a, b) => a.timestamp - b.timestamp)
  return entries
}

async function fetchFromDataApi<T>(path: string, params: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(path, DATA_API_BASE)
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    url.searchParams.append(key, String(value))
  })

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`Polymarket data API error (${response.status})`)
  }
  return await response.json() as T
}

function buildHistory(activities: ActivityEntry[], horizons: number[], end: Date): Record<string, PortfolioPoint[]> {
  if (!horizons.length) return {}
  const sortedHorizons = [...horizons].sort((a, b) => a - b)
  const maxHorizon = sortedHorizons[sortedHorizons.length - 1]
  const start = new Date(end.getTime() - maxHorizon * DAY_MS)
  const timeline = buildTimeline(activities, start, end)
  const values = evaluateTimeline(timeline, activities)

  const history: Record<string, PortfolioPoint[]> = {}
  for (const horizon of sortedHorizons) {
    const cutoff = new Date(end.getTime() - horizon * DAY_MS)
    let filtered = values.filter(point => point.date >= cutoff)
    if (!filtered.length && values.length) {
      filtered = [values[values.length - 1]]
    }
    history[String(horizon)] = filtered.map(point => ({
      date: point.date.toISOString(),
      value: roundValue(point.value)
    }))
  }
  return history
}

function buildTimeline(activities: ActivityEntry[], start: Date, end: Date): Date[] {
  const times = new Set<number>([start.getTime(), end.getTime()])
  for (const activity of activities) {
    const ts = activity.timestamp * 1000
    if (ts >= start.getTime() && ts <= end.getTime()) {
      times.add(ts)
    }
  }
  return Array.from(times).sort((a, b) => a - b).map(ms => new Date(ms))
}

function evaluateTimeline(timeline: Date[], activities: ActivityEntry[]): Array<{ date: Date; value: number }> {
  if (!timeline.length) return []
  const holdings = new Map<string, number>()
  const lastPrice = new Map<string, number>()
  const results: Array<{ date: Date; value: number }> = []

  let activityIndex = 0
  const totalActivities = activities.length
  const firstTimestamp = timeline[0].getTime()

  while (activityIndex < totalActivities && activities[activityIndex].timestamp * 1000 < firstTimestamp) {
    applyActivity(activities[activityIndex], holdings, lastPrice)
    activityIndex += 1
  }

  for (const timestamp of timeline) {
    while (activityIndex < totalActivities && activities[activityIndex].timestamp * 1000 <= timestamp.getTime()) {
      applyActivity(activities[activityIndex], holdings, lastPrice)
      activityIndex += 1
    }
    results.push({ date: timestamp, value: portfolioValue(holdings, lastPrice) })
  }

  return results
}

function applyActivity(activity: ActivityEntry, holdings: Map<string, number>, lastPrice: Map<string, number>) {
  if (!activity.asset) return
  const delta = getSignedSize(activity)
  if (delta !== 0) {
    const current = holdings.get(activity.asset) ?? 0
    const next = current + delta
    if (Math.abs(next) < 1e-9) {
      holdings.delete(activity.asset)
    } else {
      holdings.set(activity.asset, next)
    }
  }
  if (typeof activity.price === 'number') {
    lastPrice.set(activity.asset, activity.price)
  }
}

function getSignedSize(activity: ActivityEntry): number {
  const qty = Number(activity.size ?? 0)
  if (!qty) return 0
  switch (activity.type) {
    case 'TRADE':
      return activity.side === 'BUY' ? qty : -qty
    case 'MERGE':
    case 'REDEEM':
      return -qty
    case 'SPLIT':
      return qty
    default:
      return 0
  }
}

function portfolioValue(holdings: Map<string, number>, lastPrice: Map<string, number>): number {
  let total = 0
  holdings.forEach((qty, token) => {
    const price = lastPrice.get(token)
    if (typeof price === 'number') {
      total += qty * price
    }
  })
  return total
}

function computeStats(
  openPositions: PolymarketPosition[],
  closedPositions: PolymarketClosedPosition[],
  start: Date,
  end: Date
): PolymarketWalletStats {
  const totalOpenValue = openPositions.reduce((sum, position) => sum + Number(position.currentValue ?? 0), 0)
  const totalInitialValue = openPositions.reduce((sum, position) => sum + Number(position.initialValue ?? 0), 0)
  const totalUnrealized = openPositions.reduce((sum, position) => sum + Number(position.cashPnl ?? 0), 0)
  const totalRealized = closedPositions.reduce((sum, position) => sum + Number(position.realizedPnl ?? 0), 0)

  return {
    total_open_value: Number(totalOpenValue.toFixed(2)),
    total_initial_value: Number(totalInitialValue.toFixed(2)),
    total_unrealized_pnl: Number(totalUnrealized.toFixed(2)),
    total_realized_pnl: Number(totalRealized.toFixed(2)),
    open_positions_count: openPositions.length,
    closed_positions_count: closedPositions.length,
    activity_start: start.toISOString(),
    activity_end: end.toISOString()
  }
}

function roundValue(value: number, precision = 6): number {
  return Number(value.toFixed(precision))
}
