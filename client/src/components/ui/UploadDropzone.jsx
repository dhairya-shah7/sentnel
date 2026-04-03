import { useDropzone } from 'react-dropzone';

export default function UploadDropzone({ onFile, maxSizeMB = null, loading = false }) {
  const maxSize = Number.isFinite(maxSizeMB) && maxSizeMB > 0 ? maxSizeMB * 1024 * 1024 : undefined;
  const { getRootProps, getInputProps, isDragActive, acceptedFiles, fileRejections } = useDropzone({
    accept: {
      'text/csv': ['.csv'],
      'text/plain': ['.csv'],
      'application/vnd.ms-excel': ['.csv'],
      'application/octet-stream': ['.csv'],
    },
    maxFiles: 1,
    ...(maxSize ? { maxSize } : {}),
    onDropAccepted: ([file]) => onFile?.(file),
  });

  const file = acceptedFiles[0];
  const rejection = fileRejections[0];

  return (
    <div>
      <div
        {...getRootProps()}
        className={`border-2 border-dashed p-8 text-center transition-all duration-150 cursor-pointer
          ${isDragActive ? 'border-accent bg-accent-dim' : 'border-border hover:border-border-2 hover:bg-surface-2'}
          ${loading ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <span className="text-3xl">{loading ? '⟳' : isDragActive ? '▼' : '⊕'}</span>
          {loading ? (
            <p className="text-sm font-mono text-accent">Uploading...</p>
          ) : isDragActive ? (
            <p className="text-sm font-mono text-accent">Drop CSV file here</p>
          ) : (
            <>
              <p className="text-sm text-text-secondary">
                Drag & drop a <span className="text-accent font-mono">.csv</span> file, or click to browse
              </p>
              <p className="text-xs font-mono text-text-muted">
                {maxSizeMB ? `Max size: ${maxSizeMB}MB` : 'Server-configured size limit'}
              </p>
            </>
          )}
        </div>
      </div>

      {file && !loading && (
        <div className="mt-2 px-3 py-2 bg-success-dim border border-success/20 flex items-center gap-2">
          <span className="text-success text-xs">✓</span>
          <span className="text-xs font-mono text-success">{file.name}</span>
          <span className="text-xs text-text-muted ml-auto">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
        </div>
      )}

      {rejection && (
        <div className="mt-2 px-3 py-2 bg-alert-dim border border-alert/20">
          <p className="text-xs font-mono text-alert">
            {rejection.errors[0]?.code === 'file-too-large'
              ? `File too large${maxSizeMB ? ` (max ${maxSizeMB}MB)` : ''}`
              : rejection.errors[0]?.message || 'Invalid file'}
          </p>
        </div>
      )}
    </div>
  );
}
