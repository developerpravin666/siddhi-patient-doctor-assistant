import React, { useState, useMemo, useEffect, useRef } from 'react';
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
import { SearchableSelect } from './SearchableSelect';

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

  // Paging / Sorting / Searching Mode:
  // 'server' (default): Backend handles paging, sorting, searching
  // 'client': In-memory client-side paging, sorting, searching
  mode?: 'server' | 'client';

  // Server-side controls:
  totalCount?: number;
  page?: number;
  pageSize?: number;
  sortKey?: string | null;
  sortDir?: 'asc' | 'desc';
  searchTerm?: string;

  onParamsChange?: (params: {
    page: number;
    pageSize: number;
    sortKey: string | null;
    sortDir: 'asc' | 'desc';
    search: string;
  }) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onSortChange?: (sortKey: string | null, sortDir: 'asc' | 'desc') => void;
  onSearchChange?: (search: string) => void;
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
  mode = 'server',
  totalCount,
  page: controlledPage,
  pageSize: controlledPageSize,
  sortKey: controlledSortKey,
  sortDir: controlledSortDir,
  searchTerm: controlledSearchTerm,
  onParamsChange,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  onSearchChange,
}: DataTableProps<T>) {
  // Local internal state (used if props are uncontrolled or in client mode)
  const [internalSearch, setInternalSearch] = useState(controlledSearchTerm || '');
  const [internalSortKey, setInternalSortKey] = useState<string | null>(initialSortKey || null);
  const [internalSortDir, setInternalSortDir] = useState<'asc' | 'desc'>(initialSortDir);
  const [internalPage, setInternalPage] = useState(1);
  const [internalPageSize, setPageSize] = useState(defaultPageSize);

  // Effective values
  const currentSearch = controlledSearchTerm !== undefined ? controlledSearchTerm : internalSearch;
  const currentSortKey = controlledSortKey !== undefined ? controlledSortKey : internalSortKey;
  const currentSortDir = controlledSortDir !== undefined ? controlledSortDir : internalSortDir;
  const currentPage = controlledPage !== undefined ? controlledPage : internalPage;
  const currentPageSize = controlledPageSize !== undefined ? controlledPageSize : internalPageSize;

  const isServer = mode === 'server';
  const debounceTimerRef = useRef<any>(null);

  // Sync internal search if controlled prop changes
  useEffect(() => {
    if (controlledSearchTerm !== undefined) {
      setInternalSearch(controlledSearchTerm);
    }
  }, [controlledSearchTerm]);

  // Debounced notification for search input
  const triggerParamsChange = (updates: Partial<{
    page: number;
    pageSize: number;
    sortKey: string | null;
    sortDir: 'asc' | 'desc';
    search: string;
  }>) => {
    const nextParams = {
      page: updates.page !== undefined ? updates.page : currentPage,
      pageSize: updates.pageSize !== undefined ? updates.pageSize : currentPageSize,
      sortKey: updates.sortKey !== undefined ? updates.sortKey : currentSortKey,
      sortDir: updates.sortDir !== undefined ? updates.sortDir : currentSortDir,
      search: updates.search !== undefined ? updates.search : currentSearch,
    };
    if (onParamsChange) {
      onParamsChange(nextParams);
    }
  };

  const handleSearchInput = (val: string) => {
    setInternalSearch(val);
    setInternalPage(1);

    if (isServer) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        if (onSearchChange) onSearchChange(val);
        triggerParamsChange({ search: val, page: 1 });
      }, 350);
    }
  };

  const handleClearSearch = () => {
    setInternalSearch('');
    setInternalPage(1);
    if (isServer) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (onSearchChange) onSearchChange('');
      triggerParamsChange({ search: '', page: 1 });
    }
  };

  const handleSort = (key: string) => {
    let nextKey: string | null = key;
    let nextDir: 'asc' | 'desc' = 'asc';

    if (currentSortKey === key) {
      if (currentSortDir === 'asc') {
        nextDir = 'desc';
      } else {
        nextKey = null;
        nextDir = 'asc';
      }
    }

    setInternalSortKey(nextKey);
    setInternalSortDir(nextDir);

    if (isServer) {
      if (onSortChange) onSortChange(nextKey, nextDir);
      triggerParamsChange({ sortKey: nextKey, sortDir: nextDir, page: 1 });
    }
  };

  const handlePageChange = (newPage: number) => {
    setInternalPage(newPage);
    if (isServer) {
      if (onPageChange) onPageChange(newPage);
      triggerParamsChange({ page: newPage });
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setInternalPage(1);
    if (isServer) {
      if (onPageSizeChange) onPageSizeChange(newSize);
      triggerParamsChange({ pageSize: newSize, page: 1 });
    }
  };

  // ---------------------------------------------------------------------------
  // CLIENT-SIDE PROCESSING (Only if mode === 'client')
  // ---------------------------------------------------------------------------
  const clientFilteredData = useMemo(() => {
    if (isServer) return data;
    if (!currentSearch.trim()) return data;
    const term = currentSearch.trim().toLowerCase();

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
  }, [data, currentSearch, columns, isServer]);

  const clientSortedData = useMemo(() => {
    if (isServer) return clientFilteredData;
    if (!currentSortKey) return clientFilteredData;
    const activeCol = columns.find((c) => c.key === currentSortKey);
    if (!activeCol) return clientFilteredData;

    return [...clientFilteredData].sort((a, b) => {
      let aVal: any = activeCol.sortValue ? activeCol.sortValue(a) : a[currentSortKey];
      let bVal: any = activeCol.sortValue ? activeCol.sortValue(b) : b[currentSortKey];

      if (aVal === null || aVal === undefined) return currentSortDir === 'asc' ? 1 : -1;
      if (bVal === null || bVal === undefined) return currentSortDir === 'asc' ? -1 : 1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const comp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
        return currentSortDir === 'asc' ? comp : -comp;
      }

      if (aVal instanceof Date && bVal instanceof Date) {
        return currentSortDir === 'asc' ? aVal.getTime() - bVal.getTime() : bVal.getTime() - aVal.getTime();
      }

      if (aVal < bVal) return currentSortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return currentSortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [clientFilteredData, currentSortKey, currentSortDir, columns, isServer]);

  // Total items calculation
  const totalItems = isServer
    ? (totalCount !== undefined ? totalCount : ((data as any).total ?? data.length))
    : clientSortedData.length;

  const totalPages = Math.max(1, Math.ceil(totalItems / currentPageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  // Sliced data to display
  const displayData = useMemo(() => {
    if (isServer) {
      // Server already sliced the requested page
      return data;
    }
    const startIdx = (safeCurrentPage - 1) * currentPageSize;
    return clientSortedData.slice(startIdx, startIdx + currentPageSize);
  }, [data, isServer, clientSortedData, safeCurrentPage, currentPageSize]);

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

  const startEntry = totalItems === 0 ? 0 : (safeCurrentPage - 1) * currentPageSize + 1;
  const endEntry = Math.min(startEntry + displayData.length - 1, totalItems);

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
            {searchPlaceholder && (
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={internalSearch}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition shadow-2xs placeholder-slate-400"
                />
                {internalSearch && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-md hover:bg-slate-100 transition"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {actionButton}
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="overflow-x-auto relative min-h-[160px]">
        {loading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-20">
            <div className="flex items-center gap-2.5 px-4 py-2 bg-white rounded-xl shadow-md border border-slate-200 text-xs font-semibold text-slate-700">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span>Loading data...</span>
            </div>
          </div>
        )}

        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              {columns.map((col) => {
                const isSortActive = currentSortKey === col.key;
                const canSort = col.sortable !== false;

                return (
                  <th
                    key={col.key}
                    style={{ width: col.width }}
                    className={`px-4 py-3 select-none ${col.className || ''} ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                    } ${canSort ? 'cursor-pointer hover:bg-slate-100/70 hover:text-slate-800 transition' : ''}`}
                    onClick={() => canSort && handleSort(col.key)}
                  >
                    <div
                      className={`inline-flex items-center gap-1.5 ${
                        col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'
                      }`}
                    >
                      <span>{col.header}</span>
                      {canSort && (
                        <span className="text-slate-400">
                          {isSortActive ? (
                            currentSortDir === 'asc' ? (
                              <ChevronUp className="w-3.5 h-3.5 text-indigo-600 stroke-[2.5]" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-indigo-600 stroke-[2.5]" />
                            )
                          ) : (
                            <ChevronsUpDown className="w-3 h-3 text-slate-300 opacity-60 hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-slate-700">
            {displayData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-14 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Inbox className="w-8 h-8 text-slate-300 stroke-[1.5]" />
                    <p className="font-medium text-xs">{emptyMessage}</p>
                    {currentSearch && (
                      <button
                        onClick={handleClearSearch}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline mt-1"
                      >
                        Clear search filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              displayData.map((item, rowIdx) => {
                const rowKey = keyExtractor ? keyExtractor(item, rowIdx) : item.id || rowIdx;
                return (
                  <tr
                    key={rowKey}
                    onClick={() => onRowClick && onRowClick(item)}
                    className={`transition-colors ${
                      onRowClick ? 'cursor-pointer hover:bg-slate-50/80' : 'hover:bg-slate-50/50'
                    }`}
                  >
                    {columns.map((col, colIdx) => (
                      <td
                        key={`${rowKey}-${col.key || colIdx}`}
                        className={`px-4 py-3 align-middle ${col.className || ''} ${
                          col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                        }`}
                      >
                        {col.render ? col.render(item, rowIdx) : item[col.key]}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer / Pagination Controls */}
      <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Rows per page:</span>
            <div className="w-18">
              <SearchableSelect
                size="sm"
                dropUp={true}
                searchable={false}
                value={currentPageSize}
                onChange={(val) => handlePageSizeChange(Number(val))}
                options={pageSizeOptions.map((opt) => ({
                  value: opt,
                  label: String(opt),
                }))}
              />
            </div>
          </div>

          <span className="text-slate-400 font-medium border-l border-slate-200 pl-3">
            Showing <span className="font-bold text-slate-700">{startEntry}</span> to{' '}
            <span className="font-bold text-slate-700">{endEntry}</span> of{' '}
            <span className="font-bold text-slate-700">{totalItems}</span> entries
          </span>
        </div>

        {/* Page Navigators */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => handlePageChange(1)}
            disabled={safeCurrentPage <= 1}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="First Page"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handlePageChange(safeCurrentPage - 1)}
            disabled={safeCurrentPage <= 1}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="Previous Page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-1 px-1">
            {pageNumbers.map((num, i) =>
              num === '...' ? (
                <span key={`ellipsis-${i}`} className="px-1 text-slate-400">
                  ...
                </span>
              ) : (
                <button
                  key={`page-${num}`}
                  onClick={() => handlePageChange(Number(num))}
                  className={`min-w-[28px] h-7 px-2 rounded-lg font-bold text-xs transition ${
                    safeCurrentPage === num
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  {num}
                </button>
              )
            )}
          </div>

          <button
            onClick={() => handlePageChange(safeCurrentPage + 1)}
            disabled={safeCurrentPage >= totalPages}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="Next Page"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handlePageChange(totalPages)}
            disabled={safeCurrentPage >= totalPages}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="Last Page"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
