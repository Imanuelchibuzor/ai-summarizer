const express = require("express");
const multer = require("multer");

require("dotenv").config();

const cors = require("./cors");
const { processImage, processPdf } = require("./controller");

// Initialize express
const app = express();
app.use(express.json());
app.use(cors);

// Multer memory storage: we process file in-memory and don't store on disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

//Routes
app.get("/", (req, res) => res.send("server is running"));
app.get("/favicon.ico", (req, res) => res.status(204).end());
app.post("/process-image", upload.single("file"), processImage);
app.post("/process-pdf", upload.single("file"), processPdf);

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
