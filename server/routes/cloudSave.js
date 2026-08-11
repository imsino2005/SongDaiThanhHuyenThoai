const express = require('express');
const { BlobServiceClient } = require('@azure/storage-blob');
const { body, validationResult } = require('express-validator');
const { User } = require('../models');

const router = express.Router();

const containerName = (process.env.BLOB_CONTAINER_NAME || 'cloud-saves').trim().toLowerCase();

function getBlobServiceClient() {
  const connectionString = (process.env.AZURE_STORAGE_CONNECTION_STRING || '').trim();

  if (!connectionString) {
    throw new Error('Missing Azure Storage connection string');
  }

  // Azure SDK signs requests itself. Do NOT build an Authorization header manually.
  // The connection string must belong to the same Storage Account used by this app.
  try {
    return BlobServiceClient.fromConnectionString(connectionString);
  } catch (err) {
    console.error('Azure Blob connection string is invalid:', err.message);
    throw new Error('Invalid Azure Storage connection string');
  }
}

async function getContainerClient() {
  const blobServiceClient = getBlobServiceClient();
  const client = blobServiceClient.getContainerClient(containerName);

  // IMPORTANT:
  // Do not pass { access: 'container' } here. That attempts to make the
  // container publicly readable and fails when "Allow Blob anonymous access"
  // is disabled. A container created without an access option is PRIVATE.
  await client.createIfNotExists();

  return client;
}

function safeBlobName(userId) {
  return `save_${String(userId)}.json`;
}

router.post('/', [
  body('saveData').notEmpty().withMessage('Save payload is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const saveData = req.body.saveData;
    const payload = JSON.stringify(saveData);

    const containerClient = await getContainerClient();
    const blobName = safeBlobName(user.id);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload(payload, Buffer.byteLength(payload, 'utf8'), {
      overwrite: true,
      blobHTTPHeaders: {
        blobContentType: 'application/json; charset=utf-8'
      }
    });

    // Keep the blob URL as a reference only. The blob remains PRIVATE.
    // Loading is always performed server-side with the authenticated SDK.
    user.cloudSaveUrl = blockBlobClient.url;
    await user.save();

    res.json({
      saved: true,
      blobName,
      container: containerName
    });
  } catch (error) {
    console.error('Cloud Save error:', error);
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user || !user.cloudSaveUrl) {
      return res.status(404).json({ error: 'Cloud save not found' });
    }

    const containerClient = await getContainerClient();

    // Prefer the fixed per-user filename. For compatibility with old saves,
    // derive the blob name from the stored URL when possible.
    let blobName = safeBlobName(user.id);

    try {
      const blobUrl = new URL(user.cloudSaveUrl);
      const pathSegments = blobUrl.pathname.split('/').filter(Boolean);
      if (pathSegments.length >= 2 && pathSegments[0].toLowerCase() === containerName) {
        blobName = pathSegments.slice(1).join('/');
      }
    } catch (_) {
      // Keep the default per-user blob name.
    }

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const exists = await blockBlobClient.exists();

    if (!exists) {
      return res.status(404).json({ error: 'Cloud save file not found' });
    }

    const downloadResponse = await blockBlobClient.download();
    const downloaded = await streamToString(downloadResponse.readableStreamBody);
    const saveData = JSON.parse(downloaded);

    res.json({
      url: blockBlobClient.url,
      blobName,
      cloudSave: saveData
    });
  } catch (error) {
    console.error('Cloud Load error:', error);
    next(error);
  }
});

async function streamToString(readableStream) {
  if (!readableStream) throw new Error('Azure Blob returned an empty stream');

  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    readableStream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    readableStream.on('error', reject);
  });
}

module.exports = router;
