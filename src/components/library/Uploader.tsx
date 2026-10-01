'use client';
import React, { useState, useRef } from 'react';
import { UploadCloud } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Uploader() {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (e.target.files && e.target.files.length > 0) {
      await uploadFiles(e.target.files);
    }
  };

  const uploadFiles = async (files: FileList) => {
    setIsUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Validation
      if (!file.name.endsWith('.pdf') && !file.name.endsWith('.docx')) {
        setError(`Only PDF and DOCX files are supported. You uploaded a ${file.name.substring(file.name.lastIndexOf('.'))}`);
        setIsUploading(false);
        return;
      }
      if (file.size > 25 * 1024 * 1024) {
        setError(`File ${file.name} exceeds 25 MB limit.`);
        setIsUploading(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Upload failed');
        } else {
          router.refresh();
        }
      } catch (err) {
        setError('Network error during upload');
      }
    }
    setIsUploading(false);
  };

  return (
    <div className="mb-6">
      <div 
        className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadCloud className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-1">Upload documents</h3>
        <p className="text-sm text-gray-500 mb-4">Drag and drop PDF or DOCX files here, or click to select</p>
        <p className="text-xs text-gray-400">Max size: 25 MB</p>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
          multiple 
          onChange={handleFileSelect}
        />
      </div>
      
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}
      
      {isUploading && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 text-blue-700 rounded-md text-sm flex items-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700 mr-3"></div>
          Uploading and processing...
        </div>
      )}
    </div>
  );
}
