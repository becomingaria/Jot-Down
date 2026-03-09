import React from 'react';
import { exportApi } from '../../services/api';

export default function ExportMenu({ wikiId, folderId, fileId, fileName, onClose }) {
  const handleExportMd = () => {
    if (fileId) {
      window.open(exportApi.fileAsMd(wikiId, fileId), '_blank');
    }
    onClose?.();
  };

  const handleExportDocx = () => {
    if (fileId) {
      window.open(exportApi.fileAsDocx(wikiId, fileId), '_blank');
    }
    onClose?.();
  };

  const handleExportFolder = () => {
    if (folderId) {
      window.open(exportApi.folder(wikiId, folderId), '_blank');
    }
    onClose?.();
  };

  const handleExportWiki = () => {
    if (wikiId) {
      window.open(exportApi.wiki(wikiId), '_blank');
    }
    onClose?.();
  };

  return (
    <div className="export-menu">
      <div className="export-menu-header">Export</div>
      {fileId && (
        <>
          <button onClick={handleExportMd} className="export-menu-item">
            📝 Export as Markdown (.md)
          </button>
          <button onClick={handleExportDocx} className="export-menu-item">
            📄 Export as Word (.docx)
          </button>
        </>
      )}
      {folderId && (
        <button onClick={handleExportFolder} className="export-menu-item">
          📦 Export Folder as .zip
        </button>
      )}
      {wikiId && (
        <button onClick={handleExportWiki} className="export-menu-item">
          📚 Export Entire Wiki as .zip
        </button>
      )}
    </div>
  );
}
