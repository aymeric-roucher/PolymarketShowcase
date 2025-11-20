const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081/api'

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

class ApiService {
  async getWallet(params?: { user?: string; horizons?: number[] }): Promise<PolymarketWalletSnapshot> {
    const search = new URLSearchParams()
    if (params?.user) search.append('user', params.user)
    if (params?.horizons?.length) search.append('horizons', params.horizons.join(','))
    const response = await fetch(`${API_BASE_URL}/wallet${search.size ? `?${search.toString()}` : ''}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch Polymarket wallet (${response.status})`)
    }
    return await response.json()
  }
}

export const apiService = new ApiService()
