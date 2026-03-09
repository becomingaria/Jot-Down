import React from 'react';

export default function Breadcrumbs({ wikiName, folderName, fileName }) {
  const crumbs = [];

  if (wikiName) {
    crumbs.push({ label: wikiName, icon: '📕' });
  }
  if (folderName) {
    crumbs.push({ label: folderName, icon: '📁' });
  }
  if (fileName) {
    crumbs.push({ label: fileName, icon: '📄' });
  }

  if (crumbs.length === 0) return null;

  return (
    <div className="breadcrumbs">
      {crumbs.map((crumb, i) => (
        <span key={i} className="breadcrumb-item">
          {i > 0 && <span className="breadcrumb-sep">/</span>}
          <span className="breadcrumb-icon">{crumb.icon}</span>
          <span className="breadcrumb-label">{crumb.label}</span>
        </span>
      ))}
    </div>
  );
}
