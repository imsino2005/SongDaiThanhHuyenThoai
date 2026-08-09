const express = require('express');
const { BlobServiceClient } = require('@azure/storage-blob');
const { body, validationResult } = require('express-validator');
const { User } = require('../models');

const router = express.Router();
const containerName = process.env.BLOB_CONTAINER_NAME || 'cloud-saves';

function getBlobServiceClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('Missing Azure Storage connection string');
  }

  try {
    return BlobServiceClient.fromConnectionString(connectionString);
  } catch (err) {
    throw new Error('Invalid Azure Storage connection string. Please check AZURE_STORAGE_CONNECTION_STRING in .env');
  }
}

async function getContainerClient() {
  const blobServiceClient = getBlobServiceClient();
  const client = blobServiceClient.getContainerClient(containerName);
  await client.createIfNotExists({ access: 'container' });
  return client;
}

router.post('/', [
  body('saveData').notEmpty().withMessage('Save payload is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const saveData = req.body.saveData;
    const blobName = `save_${user.id}_${Date.now()}.json`;
    const containerClient = await getContainerClient();
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.upload(JSON.stringify(saveData), Buffer.byteLength(JSON.stringify(saveData)));

    user.cloudSaveUrl = blockBlobClient.url;
    await user.save();

    res.json({ saved: true, url: blockBlobClient.url });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user || !user.cloudSaveUrl) return res.status(404).json({ error: 'Cloud save not found' });

    const containerClient = await getContainerClient();
    const blobUrl = new URL(user.cloudSaveUrl);
    const pathSegments = blobUrl.pathname.split('/').filter(Boolean);
    if (pathSegments.length < 2 || pathSegments[0] !== containerName) {
      return res.status(400).json({ error: 'Invalid cloud save URL' });
    }

    const blobName = pathSegments.slice(1).join('/');
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const downloadResponse = await blockBlobClient.download();
    const downloaded = await streamToString(downloadResponse.readableStreamBody);
    const saveData = JSON.parse(downloaded);
    res.json({ url: user.cloudSaveUrl, cloudSave: saveData });
  } catch (error) {
    next(error);
  }
});

async function streamToString(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', (chunk) => chunks.push(chunk.toString()));
    readableStream.on('end', () => resolve(chunks.join('')));
    readableStream.on('error', reject);
  });
}

module.exports = router;
