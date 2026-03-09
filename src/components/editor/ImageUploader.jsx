import React, { useRef } from 'react';
import { useModal } from '../ui/ModalProvider.jsx';

/**
 * ImageUploader component — handles image file selection, preview, and upload.
 */
export default function ImageUploader({ onUpload, disabled }) {
  const inputRef = useRef(null);
  const { showAlert } = useModal();

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      await showAlert('Invalid File', 'Please select an image file (JPEG, PNG, GIF, or WebP).');
      return;
    }

    // Validate size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      await showAlert('File Too Large', 'Image must be under 10 MB.');
      return;
    }

    onUpload(file);

    // Reset input
    e.target.value = '';
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={disabled}
        className="image-upload-btn"
        title="Upload Image"
      >
        🖼️ Image
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
    </>
  );
}
