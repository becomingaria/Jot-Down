import React from 'react';
import { csvToHtml, parseCsv } from '../../utils/csv';

/**
 * CsvTable component — renders a CSV string as an interactive HTML table.
 * In display mode, shows the rendered table.
 * In edit mode, would show raw CSV (handled by parent editor).
 */
export default function CsvTable({ csvContent }) {
  if (!csvContent) return null;

  const { headers, rows, errors } = parseCsv(csvContent);

  if (headers.length === 0) {
    return <div className="csv-empty">Empty CSV block</div>;
  }

  return (
    <div className="csv-table-wrapper">
      <table className="csv-table">
        <thead>
          <tr>
            {headers.map((header, i) => (
              <th key={i}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {headers.map((header, colIdx) => (
                <td key={colIdx}>{row[header] || ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {errors.length > 0 && (
        <div className="csv-errors">
          {errors.map((err, i) => (
            <div key={i} className="csv-error">Row {err.row}: {err.message}</div>
          ))}
        </div>
      )}
    </div>
  );
}
