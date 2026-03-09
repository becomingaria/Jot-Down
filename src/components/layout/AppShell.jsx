import React, { useState, useCallback, useEffect } from 'react';
import Sidebar from './Sidebar';
import Breadcrumbs from './Breadcrumbs';
import { useFile } from '../../hooks/useFile.jsx';
import { useWiki } from '../../hooks/useWiki.jsx';
import { imageApi } from '../../services/api';
import ImageUploader from '../editor/ImageUploader';
import ExportMenu from '../file/ExportMenu';
import ShareDialog from '../wiki/ShareDialog';
import { useModal } from '../ui/ModalProvider.jsx';

/**
 * AppShell: the main layout after authentication.
 * Provides sidebar navigation, breadcrumbs, toolbar, and the editor pane.
 * The actual canister editor (from the original App.jsx) is rendered as children.
 */
export default function AppShell({ children, editorProps }) {
  const { showAlert, showPrompt } = useModal();
  const [selectedWikiId, setSelectedWikiId] = useState(null);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [showShare, setShowShare] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { wikis, createWiki, shareWiki, loadWikis } = useWiki();

  useEffect(() => { loadWikis(); }, [loadWikis]);

  const {
    folders, files, currentFile,
    loadFolders, loadFiles, loadFile,
    createFile, createFolder,
    updateFile, importFile,
  } = useFile(selectedWikiId);

  const selectedWiki = wikis.find(w => w.wikiId === selectedWikiId);
  const selectedFolder = folders.find(f => f.folderId === selectedFolderId);

  const handleSelectWiki = useCallback((wikiId) => {
    setSelectedWikiId(wikiId);
    setSelectedFolderId(null);
    setSelectedFileId(null);
  }, []);

  const handleSelectFolder = useCallback((folderId) => {
    setSelectedFolderId(folderId);
    setSelectedFileId(null);
  }, []);

  const handleSelectFile = useCallback(async (fileId) => {
    setSelectedFileId(fileId);
    await loadFile(fileId);
  }, [loadFile]);

  const handleNewWiki = useCallback(async () => {
    const name = await showPrompt('New Wiki', 'Enter a name for the wiki:');
    if (name) {
      const result = await createWiki(name);
      setSelectedWikiId(result.wikiId);
    }
  }, [createWiki, showPrompt]);

  const handleNewFolder = useCallback(async () => {
    const name = await showPrompt('New Folder', 'Enter a name for the folder:');
    if (name) {
      await createFolder(name, selectedFolderId);
    }
  }, [createFolder, selectedFolderId, showPrompt]);

  const handleNewFile = useCallback(async () => {
    const name = await showPrompt('New File', 'Enter a file name:', 'untitled.md');
    if (name) {
      const result = await createFile(
        name.endsWith('.md') ? name : `${name}.md`,
        '',
        selectedFolderId
      );
      setSelectedFileId(result.fileId);
      await loadFile(result.fileId);
    }
  }, [createFile, selectedFolderId, loadFile, showPrompt]);

  const handleSaveContent = useCallback(async (content) => {
    if (selectedFileId && selectedWikiId) {
      await updateFile(selectedFileId, { content });
    }
  }, [selectedFileId, selectedWikiId, updateFile]);

  const handleImageUpload = useCallback(async (file) => {
    if (!selectedWikiId) {
      await showAlert('No Wiki Selected', 'Please select a wiki before uploading images.');
      return;
    }
    try {
      const result = await imageApi.upload(selectedWikiId, file);
      return result.markdownLink;
    } catch (err) {
      await showAlert('Upload Failed', 'Image upload failed: ' + err.message);
      return null;
    }
  }, [selectedWikiId, showAlert]);

  const handleImportFile = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,text/markdown';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
        const content = evt.target.result;
        const result = await importFile(file.name, content, selectedFolderId);
        setSelectedFileId(result.fileId);
        await loadFile(result.fileId);
      };
      reader.readAsText(file);
    };
    input.click();
  }, [importFile, selectedFolderId, loadFile]);

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}
      <Sidebar
        wikis={wikis}
        folders={folders}
        files={files}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
        selectedWikiId={selectedWikiId}
        selectedFolderId={selectedFolderId}
        selectedFileId={selectedFileId}
        onSelectWiki={handleSelectWiki}
        onSelectFolder={handleSelectFolder}
        onSelectFile={handleSelectFile}
        onNewWiki={handleNewWiki}
        onNewFolder={handleNewFolder}
        onNewFile={handleNewFile}
      />

      <div className="main-content">
        <div className="top-bar">
          <div className="top-bar-left">
            <button
              className="sidebar-toggle-btn"
              onClick={() => setSidebarOpen(o => !o)}
              title="Toggle Sidebar"
              aria-label="Toggle Sidebar"
            >☰</button>
            <Breadcrumbs
              wikiName={selectedWiki?.name}
              folderName={selectedFolder?.name}
              fileName={currentFile?.name}
            />
          </div>
          <div className="top-bar-right">
            {selectedWikiId && (
              <>
                <button onClick={handleImportFile} title="Import Markdown File">
                  📂 Import
                </button>
                <ImageUploader
                  onUpload={handleImageUpload}
                  disabled={!selectedWikiId}
                />
                <button
                  onClick={() => setShowExport(!showExport)}
                  title="Export"
                >
                  📦 Export
                </button>
                <button
                  onClick={() => setShowShare(true)}
                  title="Share Wiki"
                >
                  🔗 Share
                </button>
              </>
            )}
          </div>
        </div>

        {showExport && (
          <ExportMenu
            wikiId={selectedWikiId}
            folderId={selectedFolderId}
            fileId={selectedFileId}
            fileName={currentFile?.name}
            onClose={() => setShowExport(false)}
          />
        )}

        <div className="editor-pane">
          {currentFile ? (
            // Render the canister editor with the file content
            typeof children === 'function'
              ? children({
                content: currentFile.content,
                onSave: handleSaveContent,
                onImageUpload: handleImageUpload,
              })
              : children
          ) : (
            <div className="editor-placeholder">
              {selectedWikiId ? (
                <div>
                  <h2>Select a file to edit</h2>
                  <p>Choose a file from the sidebar, or create a new one.</p>
                </div>
              ) : (
                <div>
                  <h2>Welcome to Jot-Down</h2>
                  <p>Select or create a wiki to get started.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showShare && selectedWiki && (
        <ShareDialog
          wikiId={selectedWikiId}
          wikiName={selectedWiki.name}
          onShare={shareWiki}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
