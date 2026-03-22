import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';
import { API_BASE } from '../lib/api';

export function DocumentUpload() {
  const { setDocument, setUploadStatus, uploadStatus } = useDocumentStore();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploadStatus('uploading');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/api/v1/documents/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      setDocument({
        id: data.document_id,
        title: file.name,
        originalText: data.text,
        confidence: data.confidence,
        imageUrl: data.image_url,
      });
      setUploadStatus('done');
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus('error');
    }
  }, [setDocument, setUploadStatus]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/tiff': ['.tiff', '.tif'],
    },
    multiple: false,
    disabled: uploadStatus === 'uploading',
  });

  return (
    <div className="w-full h-full flex items-center justify-center p-6" style={{ backgroundColor: 'var(--gf-bg)' }}>
      <div
        {...getRootProps()}
        className={`
          w-full max-w-2xl p-12 border-2 border-dashed rounded-2xl
          transition-all cursor-pointer
          ${uploadStatus === 'uploading' ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        style={{
          borderColor: isDragActive ? 'var(--gf-gugong-red)' : 'rgba(26,30,35,0.12)',
          backgroundColor: isDragActive ? 'rgba(140,26,17,0.04)' : 'rgba(255,255,255,0.5)',
        }}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center gap-4 text-center">
          {uploadStatus === 'uploading' ? (
            <>
              <div className="w-14 h-14 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(26,30,35,0.1)', borderTopColor: 'var(--gf-gugong-red)' }} />
              <p className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>上传中...</p>
            </>
          ) : (
            <>
              <Upload className="w-14 h-14" style={{ color: 'rgba(26,30,35,0.2)' }} />
              <div>
                <p className="text-lg font-medium mb-2" style={{ color: 'var(--gf-text)' }}>
                  {isDragActive ? '松开上传' : '拖拽图片或点击上传'}
                </p>
                <p className="text-sm" style={{ color: 'rgba(26,30,35,0.4)' }}>
                  支持 JPG、PNG、TIFF 格式
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
