const express = require('express');
const multer = require('multer');
const router = express.Router();
const { uploadImage } = require('../controllers/uploadController');
const { protect } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(), // buffer stays in memory just long enough to stream to Cloudinary
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

router.post('/', protect, upload.single('image'), uploadImage);

module.exports = router;
