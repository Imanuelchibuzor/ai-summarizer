const { GoogleGenAI } = require("@google/genai");
const pdf = require("pdf-parse");

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";

// Helper function to convert a buffer to a GoogleGenerativeAI.Part object
function bufferToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType,
    },
  };
}

// Prompts
const image_prompt = `You are given an image. Respond ONLY with a single valid JSON object (no code fences, no explanation).
Schema:
{
  "title": "<a concise inage title, 3-7 words>",
  "description": "<a one-paragraph description, 2-4 sentences>"
}
Return only the JSON object.`;

const pdf_chunk_prompt = `You are given an excerpt of text from a PDF. Respond ONLY with a single valid JSON object (no code fences, no explanation).
Schema:
{
  "summary": "<a concise summary of the excerpt, 3-6 sentences>"
}
Return only the JSON object.`;

const pdf_combine_prompt = `You are given several short summaries. Combine them into ONE concise JSON object (no code fences, no explanation) that preserves the core ideas.
Schema:
{
  "summary": "<a single consolidated summary, 4-8 sentences>"
}
Return only the JSON object.`;

function extractJsonFromString(s) {
  if (!s || typeof s !== "string") return null;

  // remove common markdown/code-fence wrappers first
  const cleaned = s
    .replace(/```(?:json)?/g, "")
    .replace(/```/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function promiseTextFromResponse(response) {
  // Prefer text(), then known candidate path, then output_text
  if (!response) return null;
  if (typeof response.text === "function") return response.text();
  if (response?.candidates?.[0]?.content?.parts?.[0]?.text)
    return response.candidates[0].content.parts[0].text;
  if (response?.candidates?.[0]?.content?.text)
    return response.candidates[0].content.text;
  if (response?.output_text) return response.output_text;
  return typeof response === "string" ? response : JSON.stringify(response);
}

const processImage = async (req, res) => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });

  try {
    // Basic validation
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided." });
    }
    const { buffer, mimetype, size } = req.file;
    if (!mimetype?.startsWith?.("image/")) {
      return res.status(400).json({ error: "Uploaded file is not an image." });
    }
    const MAX_BYTES = 10 * 1024 * 1024;
    if (size > MAX_BYTES) {
      return res
        .status(413)
        .json({ error: "Image exceeds maximum size of 10MB." });
    }

    // Prepare the image for Gemini
    const imagePart = bufferToGenerativePart(buffer, mimetype);

    // Build model call payload
    const modelInput = {
      model: MODEL,
      contents: [image_prompt, imagePart],
    };

    // Call Gemini
    const response = await ai.models.generateContent(modelInput);

    // Extract text from the sdk response defensively
    let textOut = promiseTextFromResponse(response);

    // Try parse JSON (strict), then fallback extraction
    const parsed = extractJsonFromString(textOut);
    if (!parsed || typeof parsed !== "object") {
      console.error(
        "Failed to parse JSON from Gemini response. Raw output:",
        textOut
      );
      return res.status(500).json({
        error: "Failed to parse Gemini's JSON response.",
        geminiRawResponse: textOut,
      });
    }

    // Validate required keys
    const title =
      parsed.title && typeof parsed.title === "string"
        ? parsed.title.trim()
        : null;
    const description =
      parsed.description && typeof parsed.description === "string"
        ? parsed.description.trim()
        : null;

    if (!title || !description) {
      return res.status(500).json({
        error: "Gemini returned JSON but required keys are missing or invalid.",
        geminiJson: parsed,
      });
    }

    // Return the title and description
    return res.json({ title, description });
  } catch (err) {
    console.error(
      "Error analyzing image:",
      err?.response?.data || err?.message || err
    );
    return res.status(500).json({
      error: "Failed to analyze image.",
      details: err?.message || String(err),
    });
  }
};

const processPdf = async (req, res) => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });

  try {
    // Basic validation
    if (!req.file)
      return res.status(400).json({ error: "No PDF file provided." });

    const { buffer, mimetype, size } = req.file;
    if (
      !(
        mimetype === "application/pdf" ||
        req.file.originalname?.toLowerCase().endsWith(".pdf")
      )
    ) {
      return res.status(400).json({ error: "Uploaded file is not a PDF." });
    }
    if (size > 10 * 1024 * 1024)
      return res
        .status(413)
        .json({ error: "PDF exceeds maximum size of 10MB." });

    // Extract text with pdf-parse
    const data = await pdf(buffer);
    let text = (data?.text || "").trim();
    if (!text) {
      return res.status(422).json({
        error:
          "No selectable text found in PDF. If the PDF is scanned, Kindly upload a text-based PDF.",
      });
    }

    // Chunk if too long (conservative char-based chunking)
    const CHUNK_SIZE = 24000;
    const chunks = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      chunks.push(text.slice(i, i + CHUNK_SIZE));
    }

    const chunkSummaries = [];

    // Summarize each chunk
    for (const chunk of chunks) {
      const modelInput = {
        model: MODEL,
        contents: [pdf_chunk_prompt, { text: chunk }],
      };

      const response = await ai.models.generateContent(modelInput);
      const textOut = promiseTextFromResponse(response);
      const parsed = extractJsonFromString(textOut);

      if (!parsed || typeof parsed !== "object" || !parsed.summary) {
        // If a chunk fails to produce valid JSON summary, include a fallback string (raw or partial)
        console.error("Failed to parse chunk summary. Raw:", textOut);
        return res.status(500).json({
          error: "Failed to parse Gemini summary for a PDF chunk.",
          geminiRawResponse: textOut,
        });
      }

      chunkSummaries.push(parsed.summary.trim());
    }

    // If multiple chunk summaries, combine them; otherwise use single summary
    let finalSummary = chunkSummaries.join("\n\n");
    if (chunkSummaries.length > 1) {
      const combineInput = {
        model: MODEL,
        contents: [pdf_combine_prompt, { text: finalSummary }],
      };
      const combineResp = await ai.models.generateContent(combineInput);
      const combineText = promiseTextFromResponse(combineResp);
      const combineParsed = extractJsonFromString(combineText);

      if (
        !combineParsed ||
        typeof combineParsed !== "object" ||
        !combineParsed.summary
      ) {
        console.error("Failed to parse combined summary. Raw:", combineText);
        return res.status(500).json({
          error: "Failed to parse combined summary from Gemini.",
          geminiRawResponse: combineText,
        });
      }
      finalSummary = combineParsed.summary.trim();
    }

    // Safety length limits
    if (finalSummary.length > 4000)
      finalSummary = finalSummary.slice(0, 3997) + "...";

    return res.json({ summary: finalSummary });
  } catch (err) {
    console.error("processPdf error:", err?.response || err?.message || err);
    return res.status(500).json({
      error: "Failed to process PDF.",
      details: err?.message || String(err),
    });
  }
};

module.exports = { processImage, processPdf };
