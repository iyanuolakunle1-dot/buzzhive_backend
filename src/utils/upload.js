const streamifier = require('streamifier');
const cloudinary = require('../config/cloudinary');

const ALLOWED_FOLDERS = new Set(['avatars', 'covers', 'posts', 'stories']);

/**
 * Uploads an in-memory file buffer (from multer) to Cloudinary, inside a
 * BuzzHive-scoped folder. Returns Cloudinary's result object, most notably
 * `secure_url` — the public HTTPS URL to store on the post/user/story row.
 * @param {Buffer} buffer
 * @param {string} folder - one of ALLOWED_FOLDERS, defaults to 'posts'
 */
function uploadBuffer(buffer, folder) {
  const safeFolder = ALLOWED_FOLDERS.has(folder) ? folder : 'posts';

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `buzzhive/${safeFolder}`,
        resource_type: 'image',
        // Keeps files reasonably sized on the way in — good for feed performance.
        transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto:good' }],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

/**
 * Deletes an image from Cloudinary given its full secure_url. Best-effort —
 * never throws, since this is just cleanup when a post/story/user is deleted.
 * @param {string|null|undefined} url
 */
async function deleteByUrl(url) {
  if (!url || !url.includes('res.cloudinary.com')) return; // not a Cloudinary asset, nothing to do

  try {
    // e.g. https://res.cloudinary.com/<cloud>/image/upload/v12345/buzzhive/posts/abc123.jpg
    // -> public_id "buzzhive/posts/abc123"
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+(?:\?.*)?$/);
    if (!match) return;
    await cloudinary.uploader.destroy(match[1], { resource_type: 'image' });
  } catch (err) {
    console.error('Cloudinary delete error:', err.message);
  }
}

module.exports = { uploadBuffer, deleteByUrl };
