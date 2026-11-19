import React, { useState, useMemo } from 'react';
import { 
  Search, 
  ChevronUp, 
  ChevronDown, 
  ChevronsUpDown, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  X,
  Inbox
} from 'lucide-react';

export interface ColumnDef<T> {
  key: string;
  header: React.ReactNode;
  sortable?: boolean;
  sortValue?: (item: T) => string | number | boolean | Date | null | undefined;
  searchValue?: (item: T) => string;
  render?: (item: T, index: number) => React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor?: (item: T, index: number) => string | number;
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  defaultPageSize?: number;
  pageSizeOptions?: number[];
  extraFilters?: React.ReactNode;
  actionButton?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  initialSortKey?: string;
  initialSortDir?: 'asc' | 'desc';
  onRowClick?: (item: T) => void;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  keyExtractor,
  loading = false,
  emptyMessage = 'No records found matching your criteria.',
  searchPlaceholder = 'Search records...',
  defaultPageSize = 10,
  pageSizeOptions = [5, 10, 25, 50],
  extraFilters,
  actionButton,
  title,
  subtitle,
  initialSortKey,
  initialSortDir = 'asc',
  onRowClick,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(initialSortKey || null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSortDir);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // 1. Filtering by search term across searchable columns
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.trim().toLowerCase();

    return data.filter((item) => {
      return columns.some((col) => {
        let valStr = '';
        if (col.searchValue) {
          valStr = col.searchValue(item);
        } else if (item[col.key] !== undefined && item[col.key] !== null) {
          valStr = String(item[col.key]);
        }
        return valStr.toLowerCase().includes(term);
      });
    });
  }, [data, searchTerm, columns]);

  // 2. Sorting
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    const activeCol = columns.find((c) => c.key === sortKey);
    if (!activeCol) return filteredData;

    return [...filteredData].sort((a, b) => {
      let aVal: any = activeCol.sortValue ? activeCol.sortValue(a) : a[sortKey];
      let bVal: any = activeCol.sortValue ? activeCol.sortValue(b) : b[sortKey];

      if (aVal === null || aVal === undefined) return sortDir === 'asc' ? 1 : -1;
      if (bVal === null || bVal === undefined) return sortDir === 'asc' ? -1 : 1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const comp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
        return sortDir === 'asc' ? comp : -comp;
      }

      if (aVal instanceof Date && bVal instanceof Date) {
        return sortDir === 'asc' ? aVal.getTime() - bVal.getTime() : bVal.getTime() - aVal.getTime();
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortKey, sortDir, columns]);

  // 3. Pagination calculations
  const totalItems = sortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedData = useMemo(() => {
    const startIdx = (safeCurrentPage - 1) * pageSize;
    return sortedData.slice(startIdx, startIdx + pageSize);
  }, [sortedData, safeCurrentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') {
        setSortDir('desc');
      } else {
        setSortKey(null);
        setSortDir('asc');
      }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // Generate page numbers with ellipsis
  const pageNumbers = useMemo(() => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safeCurrentPage > 3) pages.push('...');
      const start = Math.max(2, safeCurrentPage - 1);
      const end = Math.min(totalPages - 1, safeCurrentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (safeCurrentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  }, [totalPages, safeCurrentPage]);

  const startEntry = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endEntry = Math.min(safeCurrentPage * pageSize, totalItems);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
      {/* Table Header / Toolbar */}
      {(title || subtitle || actionButton || searchPlaceholder || extraFilters) && (
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white">
          {(title || subtitle) && (
            <div>
              {title && <div className="text-base sm:text-lg font-bold text-slate-900">{title}</div>}
              {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 ml-auto w-full md:w-auto">
            {extraFilters}

            {/* Search Bar */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-md"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {actionButton}
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80 text-slate-500 uppercase font-semibold tracking-wider select-none">
              {columns.map((col) => {
                const isSortable = col.sortable !== false;
                const isSorted = sortKey === col.key;
                const alignClass = 
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';

                return (
                  <th
                    key={col.key}
                    style={{ width: col.width }}
                    className={`py-3 px-4 ${alignClass} ${col.className || ''} ${
                      isSortable ? 'cursor-pointer hover:bg-slate-100/75 transition' : ''
                    }`}
                    onClick={() => isSortable && handleSort(col.key)}
                  >
                    <div className={`inline-flex items-center gap-1.5 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'}`}>
                      <span>{col.header}</span>
                      {isSortable && (
                        <span className="text-slate-400">
                          {isSorted ? (
                            sortDir === 'asc' ? (
                              <ChevronUp className="w-3.5 h-3.5 text-brand-600 font-bold" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-brand-600 font-bold" />
                            )
                          ) : (
                            <ChevronsUpDown className="w-3.5 h-3.5 opacity-40 hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-slate-400">
                  <div className="inline-flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-medium text-slate-500">Loading data...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-slate-400">
                  <div className="inline-flex flex-col items-center gap-2 max-w-sm mx-auto">
                    <Inbox className="w-8 h-8 text-slate-300" />
                    <span className="text-xs font-medium text-slate-600">{emptyMessage}</span>
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="text-xs text-brand-600 hover:text-brand-700 underline font-semibold mt-1"
                      >
                        Clear search filter
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((item, index) => {
                const key = keyExtractor ? keyExtractor(item, index) : item.id || index;
                return (
                  <tr
                    key={key}
                    onClick={() => onRowClick && onRowClick(item)}
                    className={`hover:bg-slate-50/60 transition ${
                      onRowClick ? 'cursor-pointer' : ''
                    }`}
                  >
                    {columns.map((col) => {
                      const alignClass =
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';

                      return (
                        <td key={col.key} className={`py-3.5 px-4 ${alignClass} ${col.className || ''}`}>
                          {col.render ? col.render(item, index) : item[col.key]}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {!loading && totalItems > 0 && (
        <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          {/* Entries count & Page Size Selector */}
          <div className="flex items-center gap-4">
            <div>
              Showing <span className="font-semibold text-slate-800">{startEntry}</span> to{' '}
              <span className="font-semibold text-slate-800">{endEntry}</span> of{' '}
              <span className="font-semibold text-slate-800">{totalItems}</span> entries
            </div>

            <div className="flex items-center gap-1.5">
              <span>Show</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="py-1 px-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {pageSizeOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <span>per page</span>
            </div>
          </div>

          {/* Page Navigation */}
          <div className="inline-flex items-center gap-1">
            <button
              onClick={() => handlePageChange(1)}
              disabled={safeCurrentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="First Page"
            >
              <ChevronsLeft className="w-3.5 h-3.5 text-slate-600" />
            </button>
            <button
              onClick={() => handlePageChange(safeCurrentPage - 1)}
              disabled={safeCurrentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-slate-600" />
            </button>

            {pageNumbers.map((p, idx) => {
              if (p === '...') {
                return (
                  <span key={`dots-${idx}`} className="px-2 py-1 text-slate-400">
                    ...
                  </span>
                );
              }
              const isCurrent = p === safeCurrentPage;
              return (
                <button
                  key={`page-${p}`}
                  onClick={() => handlePageChange(Number(p))}
                  className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-semibold border transition ${
                    isCurrent
                      ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                      : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  {p}
                </button>
              );
            })}

            <button
              onClick={() => handlePageChange(safeCurrentPage + 1)}
              disabled={safeCurrentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Next Page"
            >
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            </button>
            <button
              onClick={() => handlePageChange(totalPages)}
              disabled={safeCurrentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Last Page"
            >
              <ChevronsRight className="w-3.5 h-3.5 text-slate-600" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
