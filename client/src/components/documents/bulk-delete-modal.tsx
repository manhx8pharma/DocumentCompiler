import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Search, AlertTriangle, FileX } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Template } from '@shared/schema';

interface BulkDeleteFilters {
  dateFrom?: string;
  dateTo?: string;
  templateUuids?: string[];
  searchQuery?: string;
}

interface PreviewSummary {
  templateName: string;
  count: number;
  documents: Array<{
    uuid: string;
    name: string;
    createdAt: string;
  }>;
  hasMore: boolean;
}

interface PreviewResponse {
  success: boolean;
  totalCount: number;
  summary: PreviewSummary[];
  filters: BulkDeleteFilters;
}

interface BulkDeleteModalProps {
  children: React.ReactNode;
}

export function BulkDeleteModal({ children }: BulkDeleteModalProps) {
  const [open, setOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [filters, setFilters] = useState<BulkDeleteFilters>({});
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [confirmationInput, setConfirmationInput] = useState('');
  const [showExecuteDialog, setShowExecuteDialog] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch templates for filtering
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ['/api/templates'],
    enabled: open
  });

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: async (filters: BulkDeleteFilters) => {
      const response = await fetch('/api/documents/bulk-delete/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters })
      });
      if (!response.ok) throw new Error('Preview failed');
      return response.json() as Promise<PreviewResponse>;
    },
    onSuccess: (data) => {
      if (data.success) {
        setShowPreview(true);
      } else {
        toast({
          title: 'Preview Failed',
          description: 'Could not generate preview',
          variant: 'destructive'
        });
      }
    },
    onError: (error) => {
      console.error('Preview error:', error);
      toast({
        title: 'Preview Error',
        description: 'Failed to preview bulk delete',
        variant: 'destructive'
      });
    }
  });

  // Execute deletion mutation
  const executeMutation = useMutation({
    mutationFn: async ({ filters, confirmationToken }: { filters: BulkDeleteFilters; confirmationToken: string }) => {
      const response = await fetch('/api/documents/bulk-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters, confirmationToken })
      });
      if (!response.ok) throw new Error('Delete failed');
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'Bulk Delete Completed',
          description: `${data.deleted} documents deleted successfully`,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
        queryClient.invalidateQueries({ queryKey: ['/api/documents/stats'] });
        setOpen(false);
        resetForm();
      } else {
        toast({
          title: 'Bulk Delete Failed',
          description: data.message || 'Unknown error occurred',
          variant: 'destructive'
        });
      }
    },
    onError: (error) => {
      console.error('Execute error:', error);
      toast({
        title: 'Delete Error',
        description: 'Failed to execute bulk delete',
        variant: 'destructive'
      });
    }
  });

  const resetForm = () => {
    setFilters({});
    setSelectedTemplates([]);
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setShowPreview(false);
    setConfirmationInput('');
    setShowExecuteDialog(false);
  };

  const handlePreview = () => {
    const newFilters: BulkDeleteFilters = {
      searchQuery: searchQuery.trim() || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      templateUuids: selectedTemplates.length > 0 ? selectedTemplates : undefined
    };

    setFilters(newFilters);
    previewMutation.mutate(newFilters);
  };

  const handleExecute = () => {
    if (confirmationInput !== 'DELETE') {
      toast({
        title: 'Confirmation Required',
        description: 'Please type "DELETE" to confirm',
        variant: 'destructive'
      });
      return;
    }

    executeMutation.mutate({
      filters,
      confirmationToken: 'CONFIRM_BULK_DELETE'
    });
  };

  const toggleTemplate = (templateUuid: string) => {
    setSelectedTemplates(prev => 
      prev.includes(templateUuid)
        ? prev.filter(uuid => uuid !== templateUuid)
        : [...prev, templateUuid]
    );
  };

  const previewData = previewMutation.data;

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen);
      if (!newOpen) {
        resetForm();
      }
    }}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Bulk Delete Documents
          </DialogTitle>
        </DialogHeader>

        {!showPreview ? (
          <div className="space-y-6">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This will permanently delete documents and their files. This action cannot be undone.
              </AlertDescription>
            </Alert>

            {/* Search Filter */}
            <div className="space-y-2">
              <Label htmlFor="search">Search Query</Label>
              <Input
                id="search"
                placeholder="Search document names..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Date Range Filter */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dateFrom">From Date</Label>
                <Input
                  id="dateFrom"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateTo">To Date</Label>
                <Input
                  id="dateTo"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>

            {/* Template Filter */}
            <div className="space-y-2">
              <Label>Templates</Label>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded p-2">
                {templates.map((template) => (
                  <div key={template.uuid} className="flex items-center space-x-2">
                    <Checkbox
                      id={template.uuid}
                      checked={selectedTemplates.includes(template.uuid)}
                      onCheckedChange={() => toggleTemplate(template.uuid)}
                    />
                    <Label htmlFor={template.uuid} className="text-sm">
                      {template.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Button
              onClick={handlePreview}
              disabled={previewMutation.isPending}
              className="w-full"
            >
              <Search className="h-4 w-4 mr-2" />
              {previewMutation.isPending ? 'Generating Preview...' : 'Preview Deletion'}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Preview Results */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Preview Results</h3>
                <Badge variant="destructive">
                  {previewData?.totalCount || 0} documents will be deleted
                </Badge>
              </div>

              {previewData && previewData.totalCount > 0 ? (
                <div className="space-y-4">
                  {previewData.summary.map((group, index) => (
                    <Card key={index}>
                      <CardHeader>
                        <CardTitle className="text-sm">{group.templateName}</CardTitle>
                        <CardDescription>
                          {group.count} documents
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {group.documents.map((doc) => (
                            <div key={doc.uuid} className="text-sm p-2 bg-gray-50 rounded">
                              <div className="font-medium">{doc.name}</div>
                              <div className="text-gray-500">
                                {new Date(doc.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                          ))}
                          {group.hasMore && (
                            <div className="text-sm text-gray-500 text-center">
                              ... and {group.count - group.documents.length} more
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {/* Confirmation Section */}
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Type "DELETE" below to confirm deletion of {previewData.totalCount} documents.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <Label htmlFor="confirmation">Confirmation</Label>
                    <Input
                      id="confirmation"
                      placeholder="Type DELETE to confirm"
                      value={confirmationInput}
                      onChange={(e) => setConfirmationInput(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowPreview(false)}
                      className="flex-1"
                    >
                      Back to Filters
                    </Button>
                    <Button
                      onClick={handleExecute}
                      disabled={confirmationInput !== 'DELETE' || executeMutation.isPending}
                      variant="destructive"
                      className="flex-1"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {executeMutation.isPending ? 'Deleting...' : 'Delete Documents'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileX className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No documents found</h3>
                  <p className="text-gray-500">No documents match your current filters.</p>
                  <Button
                    variant="outline"
                    onClick={() => setShowPreview(false)}
                    className="mt-4"
                  >
                    Modify Filters
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}