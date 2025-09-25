"use client";

import type React from "react";

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  FileText,
  ImageIcon,
  Loader2,
  Copy,
  RotateCcw,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface ImageProcessingResult {
  title: string;
  description: string;
}

interface PDFProcessingResult {
  summary: string;
}

type ProcessingResult = ImageProcessingResult | PDFProcessingResult;

interface ErrorResponse {
  message?: string;
}

export default function FileUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [error, setError] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [copyFeedback, setCopyFeedback] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

  const validateFile = useCallback((file: File | null): string | null => {
    if (!file) return "No file selected";

    const isImage = file.type.startsWith("image/");
    const isPDF = file.type === "application/pdf";

    if (!isImage && !isPDF) {
      return "Please select an image or PDF file";
    }

    if (file.size > MAX_FILE_SIZE) {
      return "File size must be less than 10MB";
    }

    return null;
  }, []);

  const handleFileSelect = useCallback(
    (selectedFile: File) => {
      const validationError = validateFile(selectedFile);
      if (validationError) {
        setError(validationError);
        return;
      }

      setFile(selectedFile);
      setError("");
      setResult(null);

      // Generate preview for images
      if (selectedFile.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => setPreview(e.target?.result as string);
        reader.readAsDataURL(selectedFile);
      } else {
        setPreview(null);
      }
    },
    [validateFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        handleFileSelect(selectedFile);
      }
    },
    [handleFileSelect]
  );

  const processFile = async (): Promise<void> => {
    if (!file) return;

    setIsProcessing(true);
    setError("");
    setResult(null);

    try {
      const server = "http://localhost:4000";
      const formData = new FormData();
      formData.append("file", file);

      // Determine endpoint based on file type
      const endpoint = file.type.startsWith("image/")
        ? `${server}/process-image`
        : `${server}/process-pdf`;

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      console.log(response);

      if (!response.ok) {
        // Try to get error message from server response
        let errorMessage = `Server error: ${response.status}`;
        try {
          const errorData: ErrorResponse = await response.json();
          if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch {
          // If response isn't JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data: ProcessingResult = await response.json();
      setResult(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to process file. Please try again.";
      setError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("Copied!");
      setTimeout(() => setCopyFeedback(""), 2000);
    } catch (err) {
      setCopyFeedback("Failed to copy");
      setTimeout(() => setCopyFeedback(""), 2000);
    }
  };

  const resetForm = (): void => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError("");
    setCopyFeedback("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (
      Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
    );
  };

  const isImageResult = (
    result: ProcessingResult
  ): result is ImageProcessingResult => {
    return "title" in result && "description" in result;
  };

  const isPDFResult = (
    result: ProcessingResult
  ): result is PDFProcessingResult => {
    return "summary" in result;
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">AI Summarizer</h1>
          <p>Upload an image or PDF for processing</p>
        </div>

        {/* File Upload Area */}
        <div className="bg-card rounded-lg shadow-sm border border-border p-6 mb-6">
          <div
            className="relative border-2 border-dashed rounded-lg p-8 text-center transition-colors"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileInputChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="File upload input"
            />

            <div className="space-y-4">
              <div className="flex justify-center">
                <Upload className="h-12 w-12" />
              </div>

              <div>
                <p className="text-lg font-medium">
                  Drop your file here or click to browse
                </p>
                <p className="text-sm mt-1">
                  Supports images and PDFs up to 10MB
                </p>
              </div>
            </div>
          </div>

          {/* File Preview/Info */}
          {file && (
            <div className="mt-6 p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  {file.type.startsWith("image/") ? (
                    <ImageIcon className="h-6 w-6" />
                  ) : (
                    <FileText className="h-6 w-6" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-sm">
                    {formatFileSize(file.size)} • {file.type}
                  </p>
                </div>
              </div>

              {/* Image Preview */}
              {preview && (
                <div className="mt-4">
                  <img
                    src={preview || "/placeholder.svg"}
                    alt="Preview"
                    className="max-w-full h-auto max-h-48 rounded-lg"
                  />
                </div>
              )}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}

          {/* Process Button */}
          <div className="mt-6">
            <button
              onClick={processFile}
              disabled={!file || isProcessing}
              className="
                w-full bg-gray-700 text-white font-medium py-3 px-4 rounded-lg
                hover:bg-gray-800 disabled:opacity-50 cursor-pointer  disabled:cursor-not-allowed
                transition-colors flex items-center justify-center gap-2
              "
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Process File"
              )}
            </button>
          </div>
        </div>

        {/* Results Display */}
        {result && (
          <div className="bg-card rounded-lg shadow-sm border border-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <h2 className="text-lg font-semibold">Processing Complete</h2>
            </div>

            {/* Image Results */}
            {isImageResult(result) && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-1">Title:</h3>
                  <div className="flex items-start gap-2">
                    <p className="flex-1">{result.title}</p>
                    <button
                      onClick={() => copyToClipboard(result.title)}
                      className="p-2 hover:bg-gray-300 rounded-full transition-colors cursor-pointer"
                      aria-label="Copy title"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-1">Description</h3>
                  <div className="flex items-start gap-2">
                    <p className="flex-1">{result.description}</p>
                    <button
                      onClick={() => copyToClipboard(result.description)}
                      className="p-2 hover:bg-gray-300 rounded-full transition-colors cursor-pointer"
                      aria-label="Copy description"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PDF Results */}
            {isPDFResult(result) && (
              <div>
                <h3 className="font-semibold mb-1">Summary</h3>
                <div className="flex items-start gap-2">
                  <p className="flex-1 whitespace-pre-wrap leading-relaxed">
                    {result.summary}
                  </p>
                  <button
                    onClick={() => copyToClipboard(result.summary)}
                    className="p-2 hover:bg-gray-300 rounded-full transition-colors cursor-pointer"
                    aria-label="Copy summary"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Copy Feedback */}
            {copyFeedback && (
              <div className="mt-4 text-center">
                <span className="text-sm text-green-600 font-medium">
                  {copyFeedback}
                </span>
              </div>
            )}

            {/* Reset Button */}
            <div className="mt-6">
              <button
                onClick={resetForm}
                className="
                  w-full bg-gray-700 text-white font-medium py-2 px-4 rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 cursor-pointer
                "
              >
                <RotateCcw className="h-4 w-4" />
                Process Another File
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
