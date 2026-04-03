import { useState } from 'react';

export default function DataTable({
  columns,
  data = [],
  loading = false,
  onRowClick,
  emptyMessage = 'No records found',
  keyField = '_id',
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = [...data].sort((a, b) => {
    if (!sortKey) return 0;
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <div className="border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs table-fixed">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && col.key && handleSort(col.key)}
                  className={`px-3 py-2.5 text-left font-mono uppercase tracking-wider text-text-muted whitespace-nowrap ${
                    col.sortable !== false && col.key ? 'cursor-pointer hover:text-text-secondary select-none' : ''
                  }`}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1 text-accent">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-3" style={col.width ? { width: col.width } : undefined}>
                      <div className="h-3 bg-surface-3 rounded animate-pulse w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-text-muted font-mono">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr
                  key={row[keyField]}
                  onClick={() => onRowClick?.(row)}
                  className={`border-b border-border transition-colors ${
                    onRowClick ? 'cursor-pointer hover:bg-surface-2' : ''
                  } ${row.classification === 'critical' ? 'border-l-2 border-l-alert' : ''}`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="px-3 py-2.5 text-text-secondary font-mono whitespace-nowrap overflow-hidden text-ellipsis"
                      style={col.width ? { width: col.width } : undefined}
                      title={typeof row[col.key] === 'string' ? row[col.key] : undefined}
                    >
                      {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
