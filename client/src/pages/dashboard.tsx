import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { FileText, LayoutTemplate, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  // Fetch template stats
  const { data: templateStats, isLoading: templateStatsLoading } = useQuery({
    queryKey: ['/api/templates/stats'],
    queryFn: async () => {
      const response = await fetch('/api/templates/stats');
      if (!response.ok) throw new Error('Failed to fetch template stats');
      return response.json();
    },
  });

  // Fetch document stats
  const { data: documentStats, isLoading: documentStatsLoading } = useQuery({
    queryKey: ['/api/documents/stats'],
    queryFn: async () => {
      const response = await fetch('/api/documents/stats');
      if (!response.ok) throw new Error('Failed to fetch document stats');
      return response.json();
    },
  });

  // Fetch recent templates
  const { data: templatesResponse, isLoading: templatesLoading } = useQuery({
    queryKey: ['/api/templates'],
    queryFn: async () => {
      const response = await fetch('/api/templates?limit=4');
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
  });

  // Fetch recent documents
  const { data: documentsResponse, isLoading: documentsLoading } = useQuery({
    queryKey: ['/api/documents'],
    queryFn: async () => {
      const response = await fetch('/api/documents?limit=5');
      if (!response.ok) throw new Error('Failed to fetch documents');
      return response.json();
    },
  });

  const recentTemplates = templatesResponse?.templates || [];
  const recentDocuments = documentsResponse?.documents || [];

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Templates</CardTitle>
            <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {templateStatsLoading ? "..." : templateStats?.total || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {documentStatsLoading ? "..." : documentStats?.total || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Templates</CardTitle>
            <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {templateStatsLoading ? "..." : templateStats?.active || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {documentStatsLoading ? "..." : documentStats?.active || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks to get you started</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link href="/templates">
              <Button className="w-full justify-start" variant="outline">
                <LayoutTemplate className="mr-2 h-4 w-4" />
                Manage Templates
              </Button>
            </Link>
            <Link href="/documents">
              <Button className="w-full justify-start" variant="outline">
                <FileText className="mr-2 h-4 w-4" />
                View Documents
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Recent Templates */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Templates</CardTitle>
            <CardDescription>
              {templatesLoading ? "Loading..." : `${recentTemplates.length} templates`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {templatesLoading ? (
                <div>Loading templates...</div>
              ) : recentTemplates.length > 0 ? (
                recentTemplates.slice(0, 3).map((template: any) => (
                  <div key={template.uuid} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{template.name}</span>
                    </div>
                    <Link href={`/template-preview/${template.uuid}`}>
                      <Button size="sm" variant="ghost">View</Button>
                    </Link>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No templates found</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Documents */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Documents</CardTitle>
          <CardDescription>
            {documentsLoading ? "Loading..." : `${recentDocuments.length} documents`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {documentsLoading ? (
              <div>Loading documents...</div>
            ) : recentDocuments.length > 0 ? (
              recentDocuments.slice(0, 5).map((document: any) => (
                <div key={document.uuid} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{document.name}</span>
                  </div>
                  <Link href={`/document-update/${document.uuid}`}>
                    <Button size="sm" variant="ghost">Edit</Button>
                  </Link>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No documents found</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}