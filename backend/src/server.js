require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const morgan = require('morgan')
const http = require('http')
const { Server } = require('socket.io')
const { connectDb } = require('./utils/db')

const authRoutes = require('./routes/auth')
const complaintRoutes = require('./routes/complaints')
const binRoutes = require('./routes/bins')
const aiRoutes = require('./routes/ai')
const leaderboardRoutes = require('./routes/leaderboard')
const teamRoutes = require('./routes/teams')
const profileRoutes = require('./routes/profile')

// Handle upload route - create basic handler if file doesn't exist
let uploadRoutes
try {
  uploadRoutes = require('./routes/upload')
} catch (err) {
  const express = require('express')
  uploadRoutes = express.Router()
  uploadRoutes.post('/image', async (req, res) => {
    res.status(501).json({ error: 'Image upload not yet implemented' })
  })
}

const app = express()
const server = http.createServer(app)
const io = new Server(server, { cors: { origin: '*', credentials: true } })

app.set('trust proxy', 1)
app.use(cors({ origin:  ["https://smart-waste-management-frontend.onrender.com"], credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(morgan('dev'))

app.get('/health', (_, res) => res.json({ ok: true }))
app.use('/api/auth', authRoutes)
app.use('/api/complaints', complaintRoutes(io))
app.use('/api/bins', binRoutes(io))
app.use('/api/ai', aiRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/leaderboard', leaderboardRoutes)
app.use('/api/teams', teamRoutes)
app.use('/api/profile', profileRoutes)

io.on('connection', socket => {
  socket.on('disconnect', () => {})
})

const port = process.env.PORT || 4000
connectDb()
  .then(() => {
    server.listen(port, () => {
      console.log(`✅ API listening on :${port}`)
      console.log(`✅ MongoDB connected successfully`)
    })
  })
  .catch((err) => {
    console.error('❌ Failed to connect to database:', err.message)
    console.log('⚠️  Server will still start, but database features will not work.')
    console.log('💡 Make sure MONGODB_URI is set in your .env file for MongoDB Atlas')
    server.listen(port, () => {
      console.log(`⚠️  API listening on :${port} (DB not connected)`)
    })
  })



