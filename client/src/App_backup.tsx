import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Switch, Route, Link, useLocation, useParams } from "wouter";
import { useState, useEffect } from "react";
import React from "react";
import { TemplatePreviewPane } from "./components/TemplatePreviewPane";
import { useToast } from "@/hooks/use-toast";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function TestDashboard() {
  const { data: templateStats, isLoading: templateStatsLoading } = useQuery({
    queryKey: ['/api/templates/stats'],
    queryFn: async () => {
      const response = await fetch('/api/templates/stats');
      if (!response.ok) throw new Error('Failed to fetch template stats');
      return response.json();
    },
  });

  const { data: documentStats, isLoading: documentStatsLoading } = useQuery({
    queryKey: ['/api/documents/stats'],
    queryFn: async () => {
      const response = await fetch('/api/documents/stats');
      if (!response.ok) throw new Error('Failed to fetch document stats');
      return response.json();
    },
  });

  const { data: recentTemplates, isLoading: templatesLoading } = useQuery({
    queryKey: ['/api/templates', 'recent'],
    queryFn: async () => {
      const response = await fetch('/api/templates?limit=3');
      if (!response.ok) throw new Error('Failed to fetch recent templates');
      return response.json();
    },
  });

  const { data: recentDocuments, isLoading: documentsLoading } = useQuery({
    queryKey: ['/api/documents', 'recent'],
    queryFn: async () => {
      const response = await fetch('/api/documents?limit=5');
      if (!response.ok) throw new Error('Failed to fetch recent documents');
      return response.json();
    },
  });

  const isLoading = templateStatsLoading || documentStatsLoading || templatesLoading || documentsLoading;

  if (isLoading) {
    return <div className="p-8">Loading dashboard...</div>;
  }

  const templates = recentTemplates?.templates || [];
  const documents = recentDocuments?.documents || [];

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Document Manager Dashboard</h1>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <h3 className="text-lg font-semibold text-blue-800 mb-2">Templates</h3>
          <p className="text-3xl font-bold text-blue-600">{templateStats?.total || 0}</p>
          <p className="text-sm text-blue-600 mt-1">{templateStats?.active || 0} active</p>
        </div>
        
        <div className="bg-green-50 p-6 rounded-lg border border-green-200">
          <h3 className="text-lg font-semibold text-green-800 mb-2">Documents</h3>
          <p className="text-3xl font-bold text-green-600">{documentStats?.total || 0}</p>
          <p className="text-sm text-green-600 mt-1">{documentStats?.active || 0} active</p>
        </div>
        
        <div className="bg-purple-50 p-6 rounded-lg border border-purple-200">
          <h3 className="text-lg font-semibold text-purple-800 mb-2">Quick Actions</h3>
          <div className="space-y-2">
            <Link href="/templates" className="block text-sm text-purple-600 hover:text-purple-800">
              → Manage Templates
            </Link>
            <Link href="/documents" className="block text-sm text-purple-600 hover:text-purple-800">
              → View Documents
            </Link>
          </div>
        </div>
        
        <div className="bg-orange-50 p-6 rounded-lg border border-orange-200">
          <h3 className="text-lg font-semibold text-orange-800 mb-2">System</h3>
          <Link href="/bulk-delete" className="block text-sm text-orange-600 hover:text-orange-800">
            → Bulk Delete
          </Link>
        </div>
      </div>

      {/* Recent Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Templates */}
        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Recent Templates</h2>
            <Link href="/templates" className="text-blue-600 hover:text-blue-800 text-sm">
              View All →
            </Link>
          </div>
          
          {templates.length > 0 ? (
            <div className="space-y-3">
              {templates.map((template: any) => (
                <div key={template.uuid} className="p-3 bg-gray-50 rounded border">
                  <h4 className="font-medium">{template.name}</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    Category: {template.category} • Created: {new Date(template.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No templates found</p>
          )}
        </div>

        {/* Recent Documents */}
        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Recent Documents</h2>
            <Link href="/documents" className="text-blue-600 hover:text-blue-800 text-sm">
              View All →
            </Link>
          </div>
          
          {documents.length > 0 ? (
            <div className="space-y-3">
              {documents.map((document: any) => (
                <div key={document.uuid} className="p-3 bg-gray-50 rounded border">
                  <h4 className="font-medium">{document.name}</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    Created: {new Date(document.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No documents found</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <Switch>
          <Route path="/">
            <TestDashboard />
          </Route>
          <Route path="/templates">
            <TestTemplates />
          </Route>
          <Route path="/documents">
            <TestDocuments />
          </Route>
          <Route path="/template-preview/:templateUuid">
            <TemplatePreview />
          </Route>
          <Route path="/document-create/:templateUuid">
            <DocumentCreate />
          </Route>
          <Route path="/document-update/:documentUuid">
            <DocumentUpdate />
          </Route>
          <Route path="/batch-upload/:templateUuid">
            <BatchUpload />
          </Route>
          <Route path="/bulk-delete">
            <BulkDelete />
          </Route>
          <Route path="/auth">
            <AuthPage />
          </Route>
          <Route>
            <div className="p-8">
              <h1 className="text-2xl font-bold">404 - Page Not Found</h1>
            </div>
          </Route>
        </Switch>
      </div>
    </QueryClientProvider>
  );
}

function Navigation() {
  const [location] = useLocation();
  
  return (
    <nav className="bg-white shadow-sm border-b mb-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link href="/" className="text-xl font-bold text-gray-900">
              Document Manager
            </Link>
            
            <div className="hidden md:flex space-x-4">
              <Link 
                href="/" 
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location === '/' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Dashboard
              </Link>
              <Link 
                href="/templates" 
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.startsWith('/template') 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Templates
              </Link>
              <Link 
                href="/documents" 
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.startsWith('/document') 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Documents
              </Link>
              <Link 
                href="/bulk-delete" 
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location === '/bulk-delete' 
                    ? 'bg-red-100 text-red-700' 
                    : 'text-red-600 hover:text-red-900 hover:bg-red-50'
                }`}
              >
                Bulk Delete
              </Link>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">Welcome, User</span>
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">U</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

// Placeholder components - will need full implementation
function TestTemplates() { return <div className="p-8">Templates Page</div>; }
function TestDocuments() { return <div className="p-8">Documents Page</div>; }
function TemplatePreview() { return <div className="p-8">Template Preview</div>; }
function DocumentCreate() { return <div className="p-8">Document Create</div>; }
function DocumentUpdate() { return <div className="p-8">Document Update</div>; }
function BatchUpload() { return <div className="p-8">Batch Upload</div>; }
function BulkDelete() { return <div className="p-8">Bulk Delete</div>; }
function AuthPage() { return <div className="p-8">Auth Page</div>; }