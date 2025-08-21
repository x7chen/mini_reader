const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

// 配置 multer 用于处理文件上传
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname) // 添加时间戳避免文件名冲突
  }
})

// 配置 multer 用于处理录音文件上传
const recordStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'records/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname) // 添加时间戳避免文件名冲突
  }
})

const upload = multer({ storage: storage })
const uploadRecord = multer({ storage: recordStorage })

// 提供静态文件服务
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use('/records', express.static('records'));
app.use('/data', express.static('data'));

// 解析 JSON 请求体
app.use(express.json());

// --- API 路由 ---

// 上传 PDF 文件
app.post('/upload', upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }
  
  try {
    // 生成唯一的 ID 代替文件名
    const fileId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
    const newFilename = fileId + '.pdf';
    const oldFilePath = path.join(__dirname, 'uploads', req.file.filename);
    const newFilePath = path.join(__dirname, 'uploads', newFilename);
    
    // 重命名上传的文件
    await fs.rename(oldFilePath, newFilePath);
    
    // 创建对应的备注数据文件 (JSON)
    const dataFileName = fileId + '.json';
    const dataFilePath = path.join(__dirname, 'data', dataFileName);
    await fs.writeFile(dataFilePath, JSON.stringify([])); // 初始化为空数组
    
    res.json({ 
      message: 'File uploaded successfully', 
      filename: newFilename,
      id: fileId
    });
  } catch (error) {
    console.error('Error processing uploaded file:', error);
    res.status(500).send('Internal Server Error');
  }
});

// 获取所有上传的 PDF 文件列表
app.get('/files', async (req, res) => {
  try {
    const files = await fs.readdir(path.join(__dirname, 'uploads'));
    // 过滤出 .pdf 文件
    const pdfFiles = files.filter(file => path.extname(file).toLowerCase() === '.pdf');
    
    // 为每个文件生成信息对象
    const fileInfoPromises = pdfFiles.map(async (filename) => {
      const fileId = path.parse(filename).name; // ID 就是文件名（不含扩展名）
      // 可以在这里添加更多文件信息，如上传时间等
      return {
        id: fileId,
        filename: filename
      };
    });
    
    const fileInfos = await Promise.all(fileInfoPromises);
    res.json(fileInfos);
  } catch (error) {
    console.error('Error reading uploads directory:', error);
    res.status(500).send('Internal Server Error');
  }
});

// 删除指定的 PDF 文件及其相关数据
app.delete('/files/:id', async (req, res) => {
  const fileId = req.params.id;
  const pdfFilename = fileId + '.pdf';
  const dataFilename = fileId + '.json';
  
  try {
    // 删除 PDF 文件
    const pdfFilePath = path.join(__dirname, 'uploads', pdfFilename);
    await fs.unlink(pdfFilePath);
    
    // 删除备注数据文件
    const dataFilePath = path.join(__dirname, 'data', dataFilename);
    await fs.unlink(dataFilePath);
    
    res.json({ message: 'File and related data deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    if (error.code === 'ENOENT') {
      res.status(404).send('File not found');
    } else {
      res.status(500).send('Internal Server Error');
    }
  }
});

// 获取所有上传的 PDF 文件列表
app.get('/files', async (req, res) => {
  try {
    const files = await fs.readdir(path.join(__dirname, 'uploads'));
    // 过滤出 .pdf 文件
    const pdfFiles = files.filter(file => path.extname(file).toLowerCase() === '.pdf');
    
    // 为每个文件生成信息对象
    const fileInfoPromises = pdfFiles.map(async (filename) => {
      const fileId = path.parse(filename).name; // ID 就是文件名（不含扩展名）
      // 可以在这里添加更多文件信息，如上传时间等
      return {
        id: fileId,
        filename: filename
      };
    });
    
    const fileInfos = await Promise.all(fileInfoPromises);
    res.json(fileInfos);
  } catch (error) {
    console.error('Error reading uploads directory:', error);
    res.status(500).send('Internal Server Error');
  }
});

// 获取指定 PDF 文件的备注数据
app.get('/data/:datafilename', async (req, res) => {
  const dataFilePath = path.join(__dirname, 'data', req.params.datafilename);
  
  try {
    const data = await fs.readFile(dataFilePath, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    if (error.code === 'ENOENT') {
      // 如果文件不存在，返回空数组
      res.json([]);
    } else {
      console.error('Error reading notes data:', error);
      res.status(500).send('Internal Server Error');
    }
  }
});

// 保存指定 PDF 文件的备注数据
app.post('/data/:datafilename', async (req, res) => {
  const dataFilePath = path.join(__dirname, 'data', req.params.datafilename);
  const notesData = req.body; // 期望客户端发送完整的备注数组

  try {
    await fs.writeFile(dataFilePath, JSON.stringify(notesData, null, 2));
    res.json({ message: 'Notes saved successfully' });
  } catch (error) {
    console.error('Error saving notes data:', error);
    res.status(500).send('Internal Server Error');
  }
});

// 上传录音文件
app.post('/upload-record', uploadRecord.single('record'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No record file uploaded.');
  }
  res.json({ message: 'Record uploaded successfully', filename: req.file.filename });
});

// --- 启动服务器 ---
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});