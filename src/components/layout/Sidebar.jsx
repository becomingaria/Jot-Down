import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth.jsx';

export default function Sidebar({
  wikis = [],
  folders = [],
  files = [],
  sidebarOpen = false,
  onCloseSidebar,
  selectedWikiId,
  selectedFolderId,
  selectedFileId,
  onSelectWiki,
  onSelectFolder,
  onSelectFile,
  onNewFile,
  onNewFolder,
  onNewWiki,
}) {
  const { user, isAdmin, logout } = useAuth();
  const [expandedWikis, setExpandedWikis] = useState(new Set());
  const [expandedFolders, setExpandedFolders] = useState(new Set());

  // Auto-expand when a wiki is selected (covers post-creation selection)
  useEffect(() => {
    if (selectedWikiId) {
      setExpandedWikis(prev => {
        if (prev.has(selectedWikiId)) return prev;
        return new Set([...prev, selectedWikiId]);
      });
    }
  }, [selectedWikiId]);

  // Auto-expand when a folder is selected (covers post-creation selection)
  useEffect(() => {
    if (selectedFolderId) {
      setExpandedFolders(prev => {
        if (prev.has(selectedFolderId)) return prev;
        return new Set([...prev, selectedFolderId]);
      });
    }
  }, [selectedFolderId]);

  const toggleWiki = (wikiId) => {
    setExpandedWikis(prev => {
      const next = new Set(prev);
      if (next.has(wikiId)) {
        next.delete(wikiId);
      } else {
        next.add(wikiId);
      }
      return next;
    });
    onSelectWiki(wikiId);
  };

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
    onSelectFolder(folderId);
  };

  // Build folder tree
  const rootFolders = folders.filter(f => !f.parentFolderId);
  const rootFiles = files.filter(f => !f.folderId);

  const renderFolder = (folder) => {
    const isExpanded = expandedFolders.has(folder.folderId);
    const childFolders = folders.filter(f => f.parentFolderId === folder.folderId);
    const childFiles = files.filter(f => f.folderId === folder.folderId);

    return (
      <div key={folder.folderId} className="sidebar-item folder-item">
        <div
          className={`sidebar-row ${selectedFolderId === folder.folderId ? 'active' : ''}`}
          onClick={() => toggleFolder(folder.folderId)}
        >
          <span className="sidebar-icon">{isExpanded ? '📂' : '📁'}</span>
          <span className="sidebar-label">{folder.name}</span>
        </div>
        {isExpanded && (
          <div className="sidebar-children">
            {childFolders.map(cf => renderFolder(cf))}
            {childFiles.map(cf => renderFile(cf))}
          </div>
        )}
      </div>
    );
  };

  const renderFile = (file) => (
    <div
      key={file.fileId}
      className={`sidebar-row file-row ${selectedFileId === file.fileId ? 'active' : ''}`}
      onClick={() => onSelectFile(file.fileId)}
    >
      <span className="sidebar-icon">📄</span>
      <span className="sidebar-label">{file.name}</span>
    </div>
  );

  return (
    <div className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
      <div className="sidebar-header">
        <span className="sidebar-header-title">🧠 Jot-Down</span>
        <button
          className="sidebar-close-mobile win95-titlebar-close"
          onClick={onCloseSidebar}
          title="Close Sidebar"
          aria-label="Close Sidebar"
        >✕</button>
      </div>

      <div className="sidebar-user">
        <span className="sidebar-email">{user?.email}</span>
        {isAdmin && <span className="sidebar-badge">Admin</span>}
      </div>

      <div className="sidebar-actions">
        <button onClick={onNewWiki} className="sidebar-btn" title="New Wiki">
          + Wiki
        </button>
        {selectedWikiId && (
          <>
            <button onClick={onNewFolder} className="sidebar-btn" title="New Folder">
              + Folder
            </button>
            <button onClick={onNewFile} className="sidebar-btn" title="New File">
              + File
            </button>
          </>
        )}
      </div>

      <div className="sidebar-tree">
        {wikis.map(wiki => (
          <div key={wiki.wikiId} className="sidebar-item wiki-item">
            <div
              className={`sidebar-row wiki-row ${selectedWikiId === wiki.wikiId ? 'active' : ''}`}
              onClick={() => toggleWiki(wiki.wikiId)}
            >
              <span className="sidebar-icon">
                {expandedWikis.has(wiki.wikiId) ? '📖' : '📕'}
              </span>
              <span className="sidebar-label">{wiki.name}</span>
              {wiki.accessLevel && wiki.accessLevel !== 'owner' && (
                <span className="sidebar-access">{wiki.accessLevel}</span>
              )}
            </div>
            {expandedWikis.has(wiki.wikiId) && selectedWikiId === wiki.wikiId && (
              <div className="sidebar-children">
                {rootFolders.map(f => renderFolder(f))}
                {rootFiles.map(f => renderFile(f))}
                {rootFolders.length === 0 && rootFiles.length === 0 && (
                  <div className="sidebar-empty">No files yet</div>
                )}
              </div>
            )}
          </div>
        ))}
        {wikis.length === 0 && (
          <div className="sidebar-empty">No wikis yet. Create one!</div>
        )}
      </div>

      <div className="sidebar-footer">
        <button onClick={logout} className="sidebar-btn logout-btn">
          Sign Out
        </button>
      </div>
    </div>
  );
}
