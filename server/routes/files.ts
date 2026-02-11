import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const filesRouter = Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    // Use timestamp + original name to avoid conflicts
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    // Accept CSV, JSON, and JSONL files
    const allowedExts = ['.csv', '.json', '.jsonl'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${allowedExts.join(', ')}`));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

/**
 * @swagger
 * /api/files/upload:
 *   post:
 *     summary: Upload a file
 *     description: Upload a CSV, JSON, or JSONL file (max 10MB)
 *     tags: [Files]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 filename:
 *                   type: string
 *                 originalName:
 *                   type: string
 *                 path:
 *                   type: string
 *                 size:
 *                   type: number
 *       400:
 *         description: No file uploaded or invalid file type
 */
filesRouter.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  res.json({
    success: true,
    filename: req.file.filename,
    originalName: req.file.originalname,
    path: req.file.path,
    size: req.file.size,
  });
});

/**
 * @swagger
 * /api/files/upload-multiple:
 *   post:
 *     summary: Upload multiple files
 *     description: Upload up to 20 files at once
 *     tags: [Files]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Files uploaded successfully
 *       400:
 *         description: No files uploaded
 */
filesRouter.post('/upload-multiple', upload.array('files', 20), (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  res.json({
    success: true,
    files: files.map((f) => ({
      filename: f.filename,
      originalName: f.originalname,
      path: f.path,
      size: f.size,
    })),
  });
});

/**
 * @swagger
 * /api/files/list:
 *   get:
 *     summary: List uploaded files
 *     description: Returns all files in the uploads directory
 *     tags: [Files]
 *     responses:
 *       200:
 *         description: List of uploaded files
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 files:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       filename:
 *                         type: string
 *                       size:
 *                         type: number
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       modifiedAt:
 *                         type: string
 *                         format: date-time
 */
filesRouter.get('/list', (_req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    const fileDetails = files.map((filename) => {
      const filePath = path.join(uploadsDir, filename);
      const stats = fs.statSync(filePath);
      return {
        filename,
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
      };
    });
    res.json({ files: fileDetails });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list files' });
  }
});

/**
 * @swagger
 * /api/files/{filename}:
 *   delete:
 *     summary: Delete a file
 *     description: Delete an uploaded file
 *     tags: [Files]
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the file to delete
 *     responses:
 *       200:
 *         description: File deleted successfully
 *       400:
 *         description: Invalid filename
 *       404:
 *         description: File not found
 */
filesRouter.delete('/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadsDir, filename);

  // Security: Ensure filename doesn't contain path traversal
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: `Deleted ${filename}` });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});
