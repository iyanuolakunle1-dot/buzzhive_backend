const { uploadBuffer } = require('../utils/upload');

// @route  POST /api/upload?folder=posts|stories|avatars|covers
// multipart/form-data with a single "image" field (see uploadRoutes.js for multer setup)
async function uploadImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file was uploaded' });
    }

    const result = await uploadBuffer(req.file.buffer, req.query.folder);
    res.json({ url: result.secure_url });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ message: 'Image upload failed. Please try again.' });
  }
}

module.exports = { uploadImage };
