import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, ChevronDown, ChevronLeft, ChevronRight, FileText, X, Loader2, Table2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface ScopeData {
  fields: string[];
  tables: string[];
}

function highlightText(text: string, query: string): JSX.Element {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  let matchIdx = 0;
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i + '_' + matchIdx++} className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5 not-italic">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function getSnippet(value: string, query: string): string {
  if (value.length <= 120) return value;
  const idx = value.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return value.slice(0, 120) + '…';
  const start = Math.max(0, idx - 40);
  const end = Math.min(value.length, idx + query.length + 60);
  return (start > 0 ? '…' : '') + value.slice(start, end) + (end < value.length ? '…' : '');
}

interface SearchResult {
  uuid: string;
  name: string;
  archived: boolean;
  createdAt: string;
  templateUuid: string;
  templateName: string;
  matchedFields: Array<{ fieldName: string; fieldValue: string }>;
  tableMatchCount: number;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  totalPages: number;
}

interface AdvancedSearchPanelProps {
  children: React.ReactNode;
}

export function AdvancedSearchPanel({ children }: AdvancedSearchPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  // selectedFieldNames: specific field names to filter on (empty = all fields)
  const [selectedFieldNames, setSelectedFieldNames] = useState<Set<string>>(new Set());
  // selectedTableNames: specific table names to filter on (empty = all tables when in search-all mode)
  const [selectedTableNames, setSelectedTableNames] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [isSearching, setIsSearching] = useState(false);
  const [searchData, setSearchData] = useState<SearchResponse | null>(null);
  const [lastQuery, setLastQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const { data: scopeData } = useQuery<ScopeData>({
    queryKey: ['/api/documents/search/fields'],
    queryFn: async () => {
      const res = await fetch('/api/documents/search/fields');
      if (!res.ok) throw new Error('Failed to load fields');
      return res.json();
    },
    enabled: isOpen,
    staleTime: 60_000,
  });
  const availableFields = scopeData?.fields || [];
  const availableTables = scopeData?.tables || [];

  // Derived scope state
  const allFieldsSelected = availableFields.length > 0 && availableFields.every(f => selectedFieldNames.has(f));
  const allTablesSelected = availableTables.length > 0 && availableTables.every(t => selectedTableNames.has(t));
  const nothingSelected = selectedFieldNames.size === 0 && selectedTableNames.size === 0;

  const scopeLabel = (() => {
    if (nothingSelected) return 'Tất cả (fields + bảng)';
    const parts: string[] = [];
    if (selectedFieldNames.size > 0) parts.push(`${selectedFieldNames.size} field`);
    if (selectedTableNames.size > 0) parts.push(`${selectedTableNames.size} bảng`);
    return parts.join(' + ');
  })();

  const toggleField = (name: string) => {
    setSelectedFieldNames(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const toggleAllFields = () => {
    setSelectedFieldNames(prev => {
      const next = new Set(prev);
      if (allFieldsSelected) {
        availableFields.forEach(f => next.delete(f));
      } else {
        availableFields.forEach(f => next.add(f));
      }
      return next;
    });
  };

  const toggleTable = (name: string) => {
    setSelectedTableNames(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const toggleAllTables = () => {
    setSelectedTableNames(prev => {
      const next = new Set(prev);
      if (allTablesSelected) {
        availableTables.forEach(t => next.delete(t));
      } else {
        availableTables.forEach(t => next.add(t));
      }
      return next;
    });
  };

  const clearScopes = () => {
    setSelectedFieldNames(new Set());
    setSelectedTableNames(new Set());
  };

  const buildPayload = (q: string, pg: number, lim: number) => ({
    query: q,
    fieldNames: selectedFieldNames.size > 0 ? Array.from(selectedFieldNames) : undefined,
    tableNames: selectedTableNames.size > 0 ? Array.from(selectedTableNames) : undefined,
    page: pg,
    limit: lim,
  });

  const doSearch = async (newPage = 1) => {
    if (!query.trim()) return;
    // Cancel any in-flight request before starting a new one
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsSearching(true);
    setHasSearched(true);
    setLastQuery(query.trim());
    try {
      const res = await fetch('/api/documents/search/advanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(query.trim(), newPage, limit)),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('Search failed');
      const data: SearchResponse = await res.json();
      setSearchData(data);
      setPage(newPage);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error('[AdvancedSearch]', e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') doSearch(1);
  };

  const handleLimitChange = (val: string) => {
    const newLimit = Number(val);
    setLimit(newLimit);
    if (hasSearched && lastQuery) {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSearching(true);
      fetch('/api/documents/search/advanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(lastQuery, 1, newLimit)),
        signal: controller.signal,
      })
        .then(r => r.json())
        .then((data: SearchResponse) => { setSearchData(data); setPage(1); })
        .catch((e: any) => { if (e?.name !== 'AbortError') console.error(e); })
        .finally(() => setIsSearching(false));
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base font-semibold">
            <Search className="h-4 w-4 text-blue-600" />
            Tìm kiếm nâng cao
          </SheetTitle>
          <p className="text-xs text-gray-500 mt-0.5">
            Tìm trong nội dung field và dữ liệu bảng của các documents
          </p>
        </SheetHeader>

        {/* ── Form ── */}
        <div className="px-6 py-4 space-y-3 border-b bg-gray-50 shrink-0">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Nhập từ khoá cần tìm..."
                className="pl-9 bg-white"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <Button
              onClick={() => doSearch(1)}
              disabled={isSearching || !query.trim()}
              className="shrink-0"
            >
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Tìm'}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-xs text-gray-500 shrink-0">Phạm vi:</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1 bg-white max-w-[240px]"
                >
                  <span className="truncate">{scopeLabel}</span>
                  <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <ScrollArea className="max-h-72">
                  <div className="space-y-0.5 pr-2">

                    {/* ── Fields section ── */}
                    <div className="flex items-center gap-2 py-1.5 px-2">
                      <Separator className="flex-1" />
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide">Fields</span>
                      <Separator className="flex-1" />
                    </div>

                    {/* All fields shortcut */}
                    <label className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-50 text-sm select-none">
                      <Checkbox
                        checked={allFieldsSelected}
                        onCheckedChange={toggleAllFields}
                        className="h-3.5 w-3.5"
                      />
                      <span className="font-medium text-gray-700">Tất cả fields</span>
                    </label>

                    {availableFields.map(f => (
                      <label
                        key={f}
                        className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-50 text-sm select-none"
                      >
                        <Checkbox
                          checked={selectedFieldNames.has(f)}
                          onCheckedChange={() => toggleField(f)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="truncate text-gray-600">{f}</span>
                      </label>
                    ))}

                    {availableFields.length === 0 && (
                      <p className="px-2 py-1 text-xs text-gray-400 italic">Chưa có field nào</p>
                    )}

                    {/* ── Tables section ── */}
                    <div className="flex items-center gap-2 py-1.5 px-2 mt-1">
                      <Separator className="flex-1" />
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide flex items-center gap-1">
                        <Table2 className="h-3 w-3" />
                        Bảng
                      </span>
                      <Separator className="flex-1" />
                    </div>

                    {/* All tables shortcut */}
                    <label className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-50 text-sm select-none">
                      <Checkbox
                        checked={allTablesSelected}
                        onCheckedChange={toggleAllTables}
                        className="h-3.5 w-3.5"
                      />
                      <span className="font-medium text-gray-700">Tất cả bảng</span>
                    </label>

                    {availableTables.map(t => (
                      <label
                        key={t}
                        className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-50 text-sm select-none"
                      >
                        <Checkbox
                          checked={selectedTableNames.has(t)}
                          onCheckedChange={() => toggleTable(t)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="truncate text-gray-600 flex items-center gap-1">
                          <Table2 className="h-3 w-3 text-blue-400 shrink-0" />
                          {t}
                        </span>
                      </label>
                    ))}

                    {availableTables.length === 0 && (
                      <p className="px-2 py-1 text-xs text-gray-400 italic">Chưa có bảng nào</p>
                    )}

                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>

            {!nothingSelected && (
              <button
                onClick={clearScopes}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Xoá bộ lọc phạm vi"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Results ── */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4 space-y-3">
            {hasSearched && searchData && !isSearching && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {searchData.total === 0
                    ? 'Không tìm thấy kết quả'
                    : `${searchData.total} document khớp`}
                </span>
                <Select value={String(limit)} onValueChange={handleLimitChange}>
                  <SelectTrigger className="h-7 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10/trang</SelectItem>
                    <SelectItem value="25">25/trang</SelectItem>
                    <SelectItem value="50">50/trang</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {isSearching && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                <p className="text-sm text-gray-500">Đang tìm kiếm…</p>
              </div>
            )}

            {!isSearching && hasSearched && searchData?.results.length === 0 && (
              <div className="text-center py-16 space-y-2">
                <Search className="h-8 w-8 text-gray-300 mx-auto" />
                <p className="text-sm text-gray-500">
                  Không tìm thấy document nào chứa &ldquo;<strong>{lastQuery}</strong>&rdquo;
                </p>
              </div>
            )}

            {!isSearching && !hasSearched && (
              <div className="text-center py-16 space-y-2">
                <Search className="h-8 w-8 text-gray-300 mx-auto" />
                <p className="text-sm text-gray-400">
                  Nhập từ khoá và nhấn <strong>Tìm</strong> để bắt đầu
                </p>
              </div>
            )}

            {!isSearching &&
              searchData?.results.map(doc => (
                <a
                  key={doc.uuid}
                  href={`/document-update/${doc.uuid}`}
                  className="block border rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50/50 transition-colors group no-underline"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="font-medium text-sm text-gray-900 truncate group-hover:text-blue-700 transition-colors">
                        {highlightText(doc.name, lastQuery)}
                      </span>
                    </div>
                    {doc.archived && (
                      <Badge variant="outline" className="text-[10px] shrink-0 py-0">
                        Archived
                      </Badge>
                    )}
                  </div>

                  <div className="text-xs text-gray-400 mb-2.5 flex items-center gap-1.5">
                    <span className="truncate">{doc.templateName}</span>
                    <span>·</span>
                    <span className="shrink-0">{formatDate(doc.createdAt)}</span>
                  </div>

                  {doc.matchedFields.length > 0 && (
                    <div className="space-y-1">
                      {doc.matchedFields.slice(0, 3).map((f, i) => (
                        <div
                          key={i}
                          className="text-xs bg-white rounded px-2 py-1 border border-gray-100 leading-relaxed"
                        >
                          <span className="font-medium text-gray-500 mr-1">{f.fieldName}:</span>
                          <span className="text-gray-700">
                            {highlightText(getSnippet(f.fieldValue, lastQuery), lastQuery)}
                          </span>
                        </div>
                      ))}
                      {doc.matchedFields.length > 3 && (
                        <p className="text-xs text-gray-400 pl-2">
                          +{doc.matchedFields.length - 3} field khác
                        </p>
                      )}
                    </div>
                  )}

                  {doc.tableMatchCount > 0 && (
                    <div className="mt-1.5">
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <Table2 className="h-3 w-3" />
                        {doc.tableMatchCount} hàng khớp trong bảng
                      </Badge>
                    </div>
                  )}
                </a>
              ))}
          </div>
        </ScrollArea>

        {/* ── Pagination ── */}
        {!isSearching && searchData && searchData.totalPages > 1 && (
          <div className="px-6 py-3 border-t shrink-0 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Trang {page} / {searchData.totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={page <= 1}
                onClick={() => doSearch(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={page >= searchData.totalPages}
                onClick={() => doSearch(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
