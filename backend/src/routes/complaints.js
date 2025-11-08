const router = require('express').Router()
const Complaint = require('../models/Complaint')
const { requireAuth } = require('../middleware/auth')

module.exports = (io) => {
  router.post('/', requireAuth(['citizen', 'admin', 'staff']), async (req, res) => {
    try {
      const { title, description, imageUrl, longitude, latitude, category, priority } = req.body
      
      if (!title) {
        return res.status(400).json({ error: 'Title is required' })
      }
      
      const complaint = await Complaint.create({
        userId: req.user.id,
        title,
        description,
        imageUrl,
        category: category || 'Garbage Collection',
        priority: priority || 'Medium',
        location: { 
          type: 'Point', 
          coordinates: [Number(longitude)||0, Number(latitude)||0] 
        },
        severityScore: priority === 'High' ? 50 : priority === 'Medium' ? 30 : 10
      })
      
      // Award eco-points and increment complaint count
      const User = require('../models/User')
      await User.findByIdAndUpdate(req.user.id, { 
        $inc: { ecoPoints: 10, complaintsCount: 1 } 
      })
      
      // Notify admin about new complaint (with reporter name)
      const reporter = await require('../models/User').findById(req.user.id).select('name')
      io.emit('complaint:new', { 
        id: complaint._id, 
        title: complaint.title,
        userId: complaint.userId,
        reporterName: reporter?.name || 'User',
        category: complaint.category,
        priority: complaint.priority
      })
      res.json(complaint)
    } catch (error) {
      console.error('Complaint creation error:', error)
      res.status(500).json({ error: error.message || 'Failed to create complaint' })
    }
  })

  // Get complaints - admin/staff see all, citizens see only their own, include reporter name
  router.get('/', requireAuth(['citizen', 'admin', 'staff']), async (req, res) => {
    try {
      let items
      if (req.user.role === 'citizen') {
        // Citizens can only see their own complaints
        items = await Complaint.find({ userId: req.user.id }).populate('userId', 'name').sort({ createdAt: -1 }).limit(200)
      } else {
        // Admin and staff can see all complaints
        items = await Complaint.find().populate('userId', 'name').sort({ createdAt: -1 }).limit(200)
      }
      res.json(items)
    } catch (error) {
      console.error('Failed to fetch complaints:', error)
      res.status(500).json({ error: 'Failed to fetch complaints' })
    }
  })

  router.post('/:id/resolve', requireAuth(['admin', 'staff']), async (req, res) => {
    try {
      const update = { status: 'resolved' }
      if (req.body.proofImageUrl) update.proofImageUrl = req.body.proofImageUrl
      const c = await Complaint.findByIdAndUpdate(req.params.id, update, { new: true })
      if (!c) {
        return res.status(404).json({ error: 'Complaint not found' })
      }
      
      // Populate user to get citizen info
      await c.populate('userId', 'name email')
      
      // Send notifications to both citizen and admin
      io.emit('complaint:resolved', { 
        id: c._id, 
        title: c.title,
        userId: c.userId?._id,
        message: `Your complaint "${c.title}" has been resolved!`
      })
      
      // Also emit to specific user if they're connected
      io.emit(`user:${c.userId?._id}:notification`, {
        type: 'complaint_resolved',
        message: `Your complaint "${c.title}" has been resolved!`,
        complaintId: c._id
      })
      
      res.json(c)
    } catch (error) {
      console.error('Failed to resolve complaint:', error)
      res.status(500).json({ error: 'Failed to resolve complaint' })
    }
  })

  router.post('/:id/assign', requireAuth(['admin', 'staff']), async (req, res) => {
    try {
      const { team } = req.body
      
      // Check if team is on break
      const Team = require('../models/Team')
      const teamData = await Team.findOne({ name: team })
      if (teamData && teamData.status === 'Break') {
        return res.status(400).json({ error: 'Cannot assign to team on break' })
      }
      
      const c = await Complaint.findByIdAndUpdate(req.params.id, { 
        status: 'in_progress',
        assignedTeam: team 
      }, { new: true })
      if (!c) {
        return res.status(404).json({ error: 'Complaint not found' })
      }
      io.emit('complaint:assigned', { id: c._id, team })
      res.json(c)
    } catch (error) {
      console.error('Failed to assign complaint:', error)
      res.status(500).json({ error: 'Failed to assign complaint' })
    }
  })

  return router
}
