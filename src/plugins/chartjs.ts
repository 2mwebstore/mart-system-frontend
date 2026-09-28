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
ChartJS.defaults.color = '#5A635D'
ChartJS.defaults.borderColor = '#E2DED3'
