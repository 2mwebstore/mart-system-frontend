import {
  Chart as ChartJS,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { CHART_GRID, CHART_MUTED } from '@/utils/chartColors'

ChartJS.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
)

ChartJS.defaults.font.family = "'Kantumruy Pro', sans-serif"
ChartJS.defaults.color = CHART_MUTED
ChartJS.defaults.borderColor = CHART_GRID
