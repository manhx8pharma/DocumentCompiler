import React, { useState } from 'react';
import { Search, Grid, List } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface TemplateFiltersProps {
  onSearch: (query: string) => void;
  onCategoryChange: (category: string) => void;
  onSortChange: (sort: string) => void;
  onViewChange: (view: 'grid' | 'list') => void;
  viewMode: 'grid' | 'list';
}

const TemplateFilters: React.FC<TemplateFiltersProps> = ({
  onSearch,
  onCategoryChange,
  onSortChange,
  onViewChange,
  viewMode,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    onSearch(query);
  };

  return (
    <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
      <div className="flex-1 min-w-0">
        <div className="relative rounded-md shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <Input
            type="text"
            placeholder="Search templates..."
            className="pl-10 pr-3 py-2"
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>
      </div>
      <div className="flex space-x-2">
        <Select onValueChange={onCategoryChange} defaultValue="all">
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="legal">Legal</SelectItem>
            <SelectItem value="financial">Financial</SelectItem>
            <SelectItem value="hr">HR</SelectItem>
            <SelectItem value="marketing">Marketing</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        
        <Select onValueChange={onSortChange} defaultValue="latest">
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Sort By" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="latest">Latest</SelectItem>
            <SelectItem value="name-asc">Name (A-Z)</SelectItem>
            <SelectItem value="name-desc">Name (Z-A)</SelectItem>
            <SelectItem value="modified">Last Modified</SelectItem>
          </SelectContent>
        </Select>
        
        <div className="flex items-center space-x-2 border border-gray-300 rounded-md p-2 bg-white">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`p-1 rounded-md ${
              viewMode === 'grid' ? 'bg-gray-100' : ''
            }`}
            onClick={() => onViewChange('grid')}
          >
            <Grid className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`p-1 rounded-md ${
              viewMode === 'list' ? 'bg-gray-100' : ''
            }`}
            onClick={() => onViewChange('list')}
          >
            <List className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TemplateFilters;
