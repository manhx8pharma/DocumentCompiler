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

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Templates</p>
              <p className="text-2xl font-bold text-gray-900">
                {templateStatsLoading ? "..." : templateStats?.total || 0}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Documents</p>
              <p className="text-2xl font-bold text-gray-900">
                {documentStatsLoading ? "..." : documentStats?.total || 0}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Templates</p>
              <p className="text-2xl font-bold text-gray-900">
                {templateStatsLoading ? "..." : templateStats?.active || 0}
              </p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Documents</p>
              <p className="text-2xl font-bold text-gray-900">
                {documentStatsLoading ? "..." : documentStats?.active || 0}
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white p-6 rounded-lg shadow border">
          <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link href="/templates" className="block w-full p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-blue-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="font-medium text-blue-900">Manage Templates</span>
              </div>
            </Link>
            <Link href="/documents" className="block w-full p-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-green-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="font-medium text-green-900">View All Documents</span>
              </div>
            </Link>
            <Link href="/bulk-download" className="block w-full p-3 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-emerald-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                <span className="font-medium text-emerald-900">Bulk Download</span>
              </div>
            </Link>
            <Link href="/bulk-delete" className="block w-full p-3 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-red-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span className="font-medium text-red-900">Bulk Delete</span>
              </div>
            </Link>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <h2 className="text-xl font-bold mb-4">Recent Templates</h2>
          <div className="space-y-3">
            {templatesLoading ? (
              <div>Loading templates...</div>
            ) : recentTemplates?.templates?.length > 0 ? (
              recentTemplates.templates.slice(0, 3).map((template: any) => (
                <div key={template.uuid} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{template.name}</p>
                    <p className="text-sm text-gray-600">{template.category}</p>
                  </div>
                  <Link href={`/template-preview/${template.uuid}`} className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600">
                    View
                  </Link>
                </div>
              ))
            ) : (
              <p className="text-gray-500">No templates found</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Documents */}
      <div className="bg-white p-6 rounded-lg shadow border">
        <h2 className="text-xl font-bold mb-4">Recent Documents</h2>
        <div className="space-y-3">
          {documentsLoading ? (
            <div>Loading documents...</div>
          ) : recentDocuments?.documents?.length > 0 ? (
            recentDocuments.documents.slice(0, 5).map((document: any) => (
              <div key={document.uuid} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{document.name}</p>
                  <p className="text-sm text-gray-600">Created: {new Date(document.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex space-x-2">
                  <Link href={`/document-update/${document.uuid}`} className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600">
                    Edit
                  </Link>
                  <a 
                    href={`/api/documents/${document.uuid}/download`}
                    className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                    download
                  >
                    Download
                  </a>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500">No documents found</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TestTemplates() {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateCategory, setTemplateCategory] = useState('');
  const reactQueryClient = useQueryClient();

  const { data: templatesResponse, isLoading, refetch } = useQuery({
    queryKey: ['/api/templates'],
    queryFn: async () => {
      const response = await fetch('/api/templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
  });

  const uploadTemplateMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/templates', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Failed to upload template');
      return response.json();
    },
    onSuccess: () => {
      alert('Template uploaded successfully!');
      setShowUploadModal(false);
      setUploadFile(null);
      setTemplateName('');
      setTemplateDescription('');
      setTemplateCategory('');
      reactQueryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      reactQueryClient.invalidateQueries({ queryKey: ['/api/templates/stats'] });
    },
    onError: (error: any) => {
      alert('Failed to upload template: ' + error.message);
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateUuid: string) => {
      const response = await fetch(`/api/templates/${templateUuid}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete template');
      return response.json();
    },
    onSuccess: () => {
      alert('Template deleted successfully!');
      reactQueryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      reactQueryClient.invalidateQueries({ queryKey: ['/api/templates/stats'] });
    },
    onError: (error: any) => {
      alert('Failed to delete template: ' + error.message);
    },
  });

  const handleUploadTemplate = async () => {
    if (!uploadFile || !templateName.trim()) {
      alert('Please select a file and enter a template name');
      return;
    }

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('name', templateName);
    formData.append('description', templateDescription);
    formData.append('category', templateCategory || 'general');

    await uploadTemplateMutation.mutateAsync(formData);
  };

  const templates = templatesResponse?.templates || [];

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Templates</h1>
        <button 
          onClick={() => setShowUploadModal(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Upload Template
        </button>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Upload New Template</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Template File *</label>
                <input
                  type="file"
                  accept=".docx,.doc"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Template Name *</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter template name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter template description"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <select
                  value={templateCategory}
                  onChange={(e) => setTemplateCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select category</option>
                  <option value="contract">Contract</option>
                  <option value="proposal">Proposal</option>
                  <option value="report">Report</option>
                  <option value="letter">Letter</option>
                  <option value="form">Form</option>
                  <option value="general">General</option>
                </select>
              </div>
            </div>
            <div className="flex space-x-4 mt-6">
              <button
                onClick={handleUploadTemplate}
                disabled={uploadTemplateMutation.isPending || !uploadFile || !templateName.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
              >
                {uploadTemplateMutation.isPending ? 'Uploading...' : 'Upload'}
              </button>
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="text-gray-500">Loading templates...</div>
        </div>
      ) : templates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template: any) => (
            <div key={template.uuid} className="bg-white p-6 rounded-lg shadow border hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-lg font-semibold">{template.name}</h3>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">{template.category}</span>
              </div>
              <p className="text-gray-600 mb-4 text-sm">{template.description || 'No description'}</p>
              <div className="text-xs text-gray-500 mb-4">
                Created: {new Date(template.createdAt).toLocaleDateString()}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/template-preview/${template.uuid}`} className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors">
                  Preview
                </Link>
                <Link href={`/document-create/${template.uuid}`} className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 transition-colors">
                  Create Document
                </Link>
                <Link href={`/batch-upload/${template.uuid}`} className="px-3 py-1 bg-purple-500 text-white rounded text-sm hover:bg-purple-600 transition-colors">
                  Batch Create
                </Link>
                <a 
                  href={`/api/templates/${template.uuid}/export-excel`}
                  className="px-3 py-1 bg-orange-500 text-white rounded text-sm hover:bg-orange-600 transition-colors"
                  download
                >
                  Excel Template
                </a>
                <button 
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete template "${template.name}"?`)) {
                      deleteTemplateMutation.mutate(template.uuid);
                    }
                  }}
                  className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-gray-500 mb-4">No templates found</div>
          <button 
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Upload Your First Template
          </button>
        </div>
      )}
    </div>
  );
}

function TestDocuments() {
  const reactQueryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  
  const { data: documentsResponse, isLoading } = useQuery({
    queryKey: ['/api/documents', currentPage, itemsPerPage, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString()
      });
      if (searchTerm.trim()) {
        params.append('search', searchTerm.trim());
      }
      const response = await fetch(`/api/documents?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch documents');
      return response.json();
    },
    staleTime: 1000 * 60, // 1 minute
    refetchOnWindowFocus: false,
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (documentUuid: string) => {
      const response = await fetch(`/api/documents/${documentUuid}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete document');
      return response.json();
    },
    onSuccess: () => {
      alert('Document deleted successfully!');
      reactQueryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      reactQueryClient.invalidateQueries({ queryKey: ['/api/documents/stats'] });
    },
    onError: (error: any) => {
      alert('Failed to delete document: ' + error.message);
    },
  });

  const documents = documentsResponse?.documents || [];
  const pagination = documentsResponse?.pagination;

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing items per page
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to first page when searching
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Documents</h1>
        <div className="flex items-center space-x-4">
          {/* Search input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="px-3 py-2 pl-10 border border-gray-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <svg 
              className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Show:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value={5}>5 per page</option>
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
            </select>
          </div>
        </div>
      </div>

      {pagination && (
        <div className="mb-4 text-sm text-gray-600">
          Showing {((pagination.currentPage - 1) * pagination.itemsPerPage) + 1} to {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)} of {pagination.totalItems} documents
          {searchTerm && (
            <span> - Search: "{searchTerm}"</span>
          )}
        </div>
      )}
      
      {isLoading ? (
        <div>Loading documents...</div>
      ) : documents.length > 0 ? (
        <>
          <div className="space-y-4">
            {documents.map((document: any) => (
              <div key={document.uuid} className="bg-white p-4 rounded-lg shadow border">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">{document.name}</h3>
                    <p className="text-gray-600 text-sm mb-2">Created: {new Date(document.createdAt).toLocaleDateString()}</p>
                    <span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                      {document.archived ? 'Archived' : 'Active'}
                    </span>
                  </div>
                  <div className="flex space-x-2">
                    <Link href={`/document-update/${document.uuid}`} className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600">
                      Edit
                    </Link>
                    <a 
                      href={`/api/documents/${document.uuid}/download`} 
                      className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                      download
                    >
                      Download
                    </a>
                    <button 
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete document "${document.name}"?`)) {
                          deleteDocumentMutation.mutate(document.uuid);
                        }
                      }}
                      className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <PaginationControls
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              onPageChange={handlePageChange}
              hasNextPage={pagination.hasNextPage}
              hasPrevPage={pagination.hasPrevPage}
            />
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <div className="text-gray-500 mb-4">No documents found</div>
        </div>
      )}
    </div>
  );
}

function TemplatePreview() {
  const { templateUuid } = useParams();
  
  const { data: template, isLoading } = useQuery({
    queryKey: ['/api/templates', templateUuid],
    queryFn: async () => {
      const response = await fetch(`/api/templates/${templateUuid}`);
      if (!response.ok) throw new Error('Failed to fetch template');
      return response.json();
    },
  });

  if (isLoading) return <div className="p-8">Loading template...</div>;

  return (
    <div className="p-8">
      <div className="flex items-center mb-6">
        <Link href="/templates" className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 mr-4">
          ← Back to Templates
        </Link>
        <h1 className="text-2xl font-bold">Template Preview: {template?.name}</h1>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow border">
        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2">Template Information</h3>
          <p><strong>Name:</strong> {template?.name}</p>
          <p><strong>Description:</strong> {template?.description || 'No description'}</p>
          <p><strong>Category:</strong> {template?.category}</p>
        </div>
        
        <div className="flex space-x-4">
          <Link href={`/document-create/${templateUuid}`} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
            Create Document
          </Link>
          <a 
            href={`/api/templates/${templateUuid}/download`}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            download
          >
            Download Template
          </a>
        </div>
      </div>
    </div>
  );
}

function DocumentCreate() {
  const { templateUuid } = useParams();
  const [documentName, setDocumentName] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [fieldTypeOverrides, setFieldTypeOverrides] = useState<Record<string, 'text' | 'textarea' | 'number' | 'email'>>({});
  const reactQueryClient = useQueryClient();
  
  const { data: template, isLoading } = useQuery({
    queryKey: ['/api/templates', templateUuid],
    queryFn: async () => {
      const response = await fetch(`/api/templates/${templateUuid}`);
      if (!response.ok) throw new Error('Failed to fetch template');
      return response.json();
    },
  });

  const { data: fields = [] } = useQuery({
    queryKey: ['/api/templates', templateUuid, 'fields'],
    queryFn: async () => {
      const response = await fetch(`/api/templates/${templateUuid}/fields`);
      if (!response.ok) throw new Error('Failed to fetch template fields');
      return response.json();
    },
    enabled: !!templateUuid,
  });

  const createDocumentMutation = useMutation({
    mutationFn: async (data: any) => {
      // Transform fieldValues to the format expected by the API
      const transformedFields = Object.entries(data.fieldValues).map(([fieldName, fieldValue]) => ({
        fieldName,
        fieldValue: fieldValue as string,
      }));

      console.log('Sending request with payload:', {
        name: data.name,
        templateUuid: data.templateUuid,
        fields: transformedFields,
      });

      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name,
          templateUuid: data.templateUuid,
          fields: transformedFields,
        }),
      });
      
      console.log('Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Server response:', errorData);
        
        let parsedError;
        try {
          parsedError = JSON.parse(errorData);
        } catch (e) {
          parsedError = { message: errorData };
        }
        
        const error = new Error(parsedError.message || `Failed to create document: ${response.status}`);
        (error as any).response = { data: parsedError };
        throw error;
      }
      
      const result = await response.json();
      console.log('Document creation response:', result);
      return result;
    },
    onSuccess: (data) => {
      console.log('Document created successfully:', data);
      alert('Document created successfully!');
      setDocumentName('');
      setFieldValues({});
      reactQueryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      reactQueryClient.invalidateQueries({ queryKey: ['/api/documents/stats'] });
    },
    onError: (error: any) => {
      console.error('Create document error:', error);
      console.error('Error details:', error.response || error);
      const errorMessage = error.response?.data?.error || error.message || 'Unknown error occurred';
      const errorDetails = error.response?.data?.details || '';
      alert(`Failed to create document: ${errorMessage}${errorDetails ? '\n\nDetails: ' + errorDetails : ''}`);
    },
  });

  const handleCreateDocument = async () => {
    if (!documentName.trim()) {
      alert('Please enter a document name');
      return;
    }

    console.log('Creating document with:', {
      name: documentName,
      templateUuid: templateUuid,
      fieldValues: fieldValues,
    });

    setIsCreating(true);
    try {
      await createDocumentMutation.mutateAsync({
        name: documentName,
        templateUuid: templateUuid,
        fieldValues: fieldValues,
      });
    } catch (error) {
      console.error('Create document failed:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveDocument = async () => {
    if (!documentName.trim()) {
      alert('Please enter a document name');
      return;
    }

    const downloadFields = Object.entries(fieldValues).map(([fieldName, fieldValue]) => ({
      fieldName,
      fieldValue: fieldValue as string,
    }));

    const downloadResponse = await fetch('/api/documents/download-direct', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: documentName,
        templateUuid: templateUuid,
        fields: downloadFields,
      }),
    });

    if (downloadResponse.ok) {
      const blob = await downloadResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${documentName}.docx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } else {
      alert('Failed to download document');
    }
  };

  const handleFieldChange = (fieldName: string, value: string) => {
    setFieldValues(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  const toggleFieldType = (fieldName: string, currentType: string) => {
    const newType = currentType === 'textarea' ? 'text' : 'textarea';
    setFieldTypeOverrides(prev => ({
      ...prev,
      [fieldName]: newType
    }));
  };

  const getEffectiveFieldType = (field: any) => {
    return fieldTypeOverrides[field.name] || field.fieldType || 'text';
  };

  if (isLoading) return <div className="p-8">Loading template...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Link href="/templates" className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 mr-4">
            ← Back to Templates
          </Link>
          <h1 className="text-2xl font-bold">Create Document from: {template?.name}</h1>
        </div>
        
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
        >
          {showPreview ? 'Hide Document Preview' : 'Show Document Preview'}
        </button>
      </div>
      
      {/* Dual-pane layout */}
      <div className={`grid gap-6 h-[calc(100vh-200px)] ${showPreview ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Left pane - Form */}
        <div className="bg-white p-6 rounded-lg shadow border overflow-y-auto">
          <h3 className="text-lg font-semibold mb-4">Document Information</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Document Name *</label>
              <input 
                type="text" 
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter document name"
                required
              />
            </div>

            {fields.length > 0 && (
              <>
                <h4 className="text-md font-semibold mt-6 mb-3">Template Fields</h4>
                {fields.map((field: any) => {
                  const effectiveType = getEffectiveFieldType(field);
                  return (
                    <div key={field.uuid}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium">
                          {field.name}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        <button
                          type="button"
                          onClick={() => toggleFieldType(field.name, effectiveType)}
                          className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded border text-gray-600 transition-colors"
                          title={effectiveType === 'textarea' ? 'Switch to single line' : 'Switch to multiline'}
                        >
                          {effectiveType === 'textarea' ? '📝 Multi' : '— Single'}
                        </button>
                      </div>
                      {effectiveType === 'textarea' ? (
                        <textarea 
                          value={fieldValues[field.name] || ''}
                          onChange={(e) => handleFieldChange(field.name, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y transition-all duration-200"
                          placeholder={field.placeholder || `Enter ${field.name}`}
                          required={field.required}
                          rows={3}
                        />
                      ) : (
                        <input 
                          type={effectiveType === 'number' ? 'number' : effectiveType === 'email' ? 'email' : 'text'} 
                          value={fieldValues[field.name] || ''}
                          onChange={(e) => handleFieldChange(field.name, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
                          placeholder={field.placeholder || `Enter ${field.name}`}
                          required={field.required}
                        />
                      )}
                      {field.description && (
                        <p className="text-xs text-gray-500 mt-1">{field.description}</p>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            <div className="flex space-x-4 pt-4 sticky bottom-0 bg-white">
              <button 
                onClick={handleCreateDocument}
                disabled={isCreating || !documentName.trim()}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isCreating ? 'Creating...' : 'Save to Library'}
              </button>
              <button 
                onClick={handleSaveDocument}
                disabled={!documentName.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Download Document
              </button>
              <Link href="/templates" className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">
                Cancel
              </Link>
            </div>
          </div>
        </div>

        {/* Right pane - Preview */}
        {showPreview && (
          <div className="bg-white rounded-lg shadow border flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
            <div className="flex items-center justify-between p-4 pb-2 border-b">
              <h3 className="text-lg font-semibold">Document Preview</h3>
            </div>
            
            <div className="document-preview-content flex-1">
              <div className="document-preview-paper">
                <TemplatePreviewPane 
                  templateUuid={templateUuid || null}
                  fieldValues={fieldValues}
                  className="document-preview-text"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentUpdate() {
  const { documentUuid } = useParams();
  const [documentName, setDocumentName] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isUpdating, setIsUpdating] = useState(false);
  const [previewHTML, setPreviewHTML] = useState<string>('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [fieldTypeOverrides, setFieldTypeOverrides] = useState<Record<string, 'text' | 'textarea' | 'number' | 'email'>>({});
  const reactQueryClient = useQueryClient();

  const { data: document, isLoading, error: documentError } = useQuery({
    queryKey: ['/api/documents', documentUuid],
    queryFn: async () => {
      const response = await fetch(`/api/documents/${documentUuid}`);
      if (!response.ok) throw new Error('Failed to fetch document');
      return response.json();
    },
    enabled: !!documentUuid,
  });

  const { data: fieldsData, error: fieldsError } = useQuery({
    queryKey: ['/api/documents', documentUuid, 'fields'],
    queryFn: async () => {
      const response = await fetch(`/api/documents/${documentUuid}/fields`);
      if (!response.ok) throw new Error('Failed to fetch document fields');
      return response.json();
    },
    enabled: !!documentUuid,
  });

  // Update state when data changes
  useEffect(() => {
    if (document?.name) {
      setDocumentName(document.name);
    }
  }, [document]);

  useEffect(() => {
    if (fieldsData && Array.isArray(fieldsData)) {
      const initialValues: Record<string, string> = {};
      fieldsData.forEach((field: any) => {
        initialValues[field.uuid] = field.fieldValue || '';
      });
      setFieldValues(initialValues);
    }
  }, [fieldsData]);

  const updateDocumentMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/documents/${documentUuid}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update document');
      return response.json();
    },
    onSuccess: () => {
      alert('Document updated successfully!');
      reactQueryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      reactQueryClient.invalidateQueries({ queryKey: ['/api/documents', documentUuid] });
    },
    onError: (error: any) => {
      alert('Failed to update document: ' + error.message);
    },
  });

  const handleUpdateDocument = async () => {
    if (!documentName.trim()) {
      alert('Please enter a document name');
      return;
    }

    setIsUpdating(true);
    try {
      await updateDocumentMutation.mutateAsync({
        name: documentName,
        fieldValues: fieldValues,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleFieldChange = (fieldUuid: string, value: string) => {
    setFieldValues(prev => ({
      ...prev,
      [fieldUuid]: value
    }));
  };

  const toggleFieldTypeUpdate = (fieldName: string, currentType: string) => {
    const newType = currentType === 'textarea' ? 'text' : 'textarea';
    setFieldTypeOverrides(prev => ({
      ...prev,
      [fieldName]: newType
    }));
  };

  const getEffectiveFieldTypeUpdate = (field: any) => {
    return fieldTypeOverrides[field.fieldName] || field.fieldType || 'text';
  };

  const updatePreview = async () => {
    if (!document?.template?.uuid) return;
    
    setIsPreviewLoading(true);
    try {
      // Transform field values to the format expected by the API
      const previewFields = Object.entries(fieldValues).map(([fieldUuid, fieldValue]) => {
        const field = fieldsData?.find((f: any) => f.uuid === fieldUuid);
        return {
          fieldName: field?.fieldName || fieldUuid,
          fieldValue: fieldValue as string,
        };
      });

      const response = await fetch('/api/documents/preview-template', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateUuid: document.template.uuid,
          fields: previewFields,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const htmlContent = data.preview || data.html || '';
        setPreviewHTML(htmlContent);
      } else {
        // If preview fails, show field summary instead
        const fieldSummary = Object.entries(fieldValues).map(([fieldUuid, value]) => {
          const field = fields.find((f: any) => f.uuid === fieldUuid);
          return `<p><strong>${field?.fieldName || fieldUuid}:</strong> ${value}</p>`;
        }).join('');
        setPreviewHTML(`
          <div style="padding: 16px; background: #f9f9f9; border-radius: 8px; white-space: pre-wrap;">
            <h3>Document Fields Preview</h3>
            <p><em>Template preview unavailable - showing field values:</em></p>
            ${fieldSummary}
          </div>
        `);
      }
    } catch (error) {
      console.error('Error updating preview:', error);
      // Show field summary as fallback
      const fieldSummary = Object.entries(fieldValues).map(([fieldUuid, value]) => {
        const field = fields.find((f: any) => f.uuid === fieldUuid);
        return `<p><strong>${field?.fieldName || fieldUuid}:</strong> ${value}</p>`;
      }).join('');
      setPreviewHTML(`
        <div style="padding: 16px; background: #f9f9f9; border-radius: 8px; white-space: pre-wrap;">
          <h3>Document Fields Preview</h3>
          <p><em>Preview unavailable - showing field values:</em></p>
          ${fieldSummary}
        </div>
      `);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // Update preview when field values change - MUST be before any early returns
  useEffect(() => {
    if (document?.template?.uuid && fieldsData && fieldsData.length > 0) {
      updatePreview();
    }
  }, [fieldValues, documentName, document?.template?.uuid, fieldsData]);

  if (isLoading) return <div className="p-8">Loading document...</div>;
  
  if (documentError) {
    console.error('Document error:', documentError);
    return <div className="p-8 text-red-600">Error loading document: {documentError.message}</div>;
  }
  
  if (fieldsError) {
    console.error('Fields error:', fieldsError);
    return <div className="p-8 text-red-600">Error loading fields: {fieldsError.message}</div>;
  }
  
  if (!document) {
    return <div className="p-8">Document not found</div>;
  }

  const fields = fieldsData || [];
  console.log('Rendering with fields:', fields);

  return (
    <div className="p-6">
      <div className="flex items-center mb-6">
        <Link href="/documents" className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 mr-4">
          ← Back to Documents
        </Link>
        <h1 className="text-2xl font-bold">Edit Document: {document?.name}</h1>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Edit Form */}
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold mb-4">Document Information</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Document Name *</label>
              <input 
                type="text" 
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter document name"
                required
              />
            </div>

            {fields.length > 0 && (
              <>
                <h4 className="text-md font-semibold mt-6 mb-3">Document Fields</h4>
                <div className="max-h-96 overflow-y-auto space-y-4">
                  {fields.map((field: any) => {
                    const effectiveType = getEffectiveFieldTypeUpdate(field);
                    return (
                      <div key={field.uuid}>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-sm font-medium">
                            {field.fieldName}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          <button
                            type="button"
                            onClick={() => toggleFieldTypeUpdate(field.fieldName, effectiveType)}
                            className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded border text-gray-600 transition-colors"
                            title={effectiveType === 'textarea' ? 'Switch to single line' : 'Switch to multiline'}
                          >
                            {effectiveType === 'textarea' ? '📝 Multi' : '— Single'}
                          </button>
                        </div>
                        {effectiveType === 'textarea' ? (
                          <textarea 
                            value={fieldValues[field.uuid] || ''}
                            onChange={(e) => handleFieldChange(field.uuid, e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y transition-all duration-200"
                            placeholder={field.placeholder || `Enter ${field.fieldName}`}
                            required={field.required}
                            rows={3}
                          />
                        ) : (
                          <input 
                            type={effectiveType === 'number' ? 'number' : effectiveType === 'email' ? 'email' : 'text'} 
                            value={fieldValues[field.uuid] || ''}
                            onChange={(e) => handleFieldChange(field.uuid, e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
                            placeholder={field.placeholder || `Enter ${field.fieldName}`}
                            required={field.required}
                          />
                        )}
                        {field.description && (
                          <p className="text-xs text-gray-500 mt-1">{field.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div className="flex flex-col space-y-3 pt-4">
              <button 
                onClick={handleUpdateDocument}
                disabled={isUpdating || !documentName.trim()}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </button>
              <a 
                href={`/api/documents/${documentUuid}/download`}
                className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-center"
                download
              >
                Download Document
              </a>
              <Link href="/documents" className="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-center">
                Cancel
              </Link>
            </div>
          </div>
        </div>

        {/* Right Column - Preview */}
        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Document Preview</h3>
            {isPreviewLoading && (
              <div className="text-sm text-gray-500">Updating preview...</div>
            )}
          </div>
          
          <div className="document-preview-content" style={{ height: 'min(70vh, 600px)' }}>
            <div className="document-preview-paper">
              {previewHTML ? (
                <div 
                  className="document-preview-text"
                  dangerouslySetInnerHTML={{ __html: previewHTML }}
                  style={{ 
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif'
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p>Fill in the fields to see preview</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BatchUpload() {
  const { templateUuid } = useParams();
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const reactQueryClient = useQueryClient();

  const { data: template, isLoading } = useQuery({
    queryKey: ['/api/templates', templateUuid],
    queryFn: async () => {
      const response = await fetch(`/api/templates/${templateUuid}`);
      if (!response.ok) throw new Error('Failed to fetch template');
      return response.json();
    },
  });

  const uploadExcelMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      console.log('Frontend uploading to:', `/api/templates/${templateUuid}/upload-batch`);
      console.log('FormData entries:', Array.from(formData.entries()));
      
      const response = await fetch(`/api/templates/${templateUuid}/upload-batch`, {
        method: 'POST',
        body: formData,
      });
      
      console.log('Upload response status:', response.status);
      const responseText = await response.text();
      console.log('Upload response text:', responseText);
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} - ${responseText}`);
      }
      
      return JSON.parse(responseText);
    },
    onSuccess: (data) => {
      console.log('Upload success:', data);
      alert(`Successfully processed ${data.totalDocuments || 0} documents!`);
      setExcelFile(null);
      setPreviewData([]);
      // Invalidate queries to refresh data
      reactQueryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      reactQueryClient.invalidateQueries({ queryKey: ['/api/documents/stats'] });
      reactQueryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      reactQueryClient.invalidateQueries({ queryKey: ['/api/templates/stats'] });
    },
    onError: (error: any) => {
      console.error('Upload error:', error);
      alert('Failed to upload Excel file: ' + error.message);
    },
  });

  const handleFileUpload = async () => {
    if (!excelFile) {
      alert('Please select an Excel file');
      return;
    }

    const formData = new FormData();
    formData.append('file', excelFile);
    await uploadExcelMutation.mutateAsync(formData);
  };

  const handlePreview = async () => {
    if (!excelFile) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', excelFile);
      
      const response = await fetch(`/api/templates/${templateUuid}/parse-excel`, {
        method: 'POST',
        body: formData,
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.preview && data.preview.rows) {
          const formattedData = data.preview.rows.map((row: any[], index: number) => {
            const formatted: Record<string, any> = {};
            data.preview.headers.forEach((header: string, headerIndex: number) => {
              formatted[header] = row[headerIndex] || '';
            });
            return formatted;
          });
          setPreviewData(formattedData);
        }
      }
    } catch (error) {
      alert('Failed to preview Excel file');
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoading) return <div className="p-8">Loading template...</div>;

  return (
    <div className="p-8">
      <div className="flex items-center mb-6">
        <Link href="/templates" className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 mr-4">
          ← Back to Templates
        </Link>
        <h1 className="text-2xl font-bold">Batch Upload for: {template?.name}</h1>
      </div>

      <div className="bg-white p-6 rounded-lg shadow border mb-6">
        <h3 className="text-lg font-semibold mb-4">Upload Excel File</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Excel File *</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Upload an Excel file with data rows. The first row should contain column headers that match template fields.
            </p>
          </div>

          <div className="flex space-x-4">
            <button
              onClick={handlePreview}
              disabled={!excelFile || isUploading}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
            >
              {isUploading ? 'Processing...' : 'Preview Data'}
            </button>
            <button
              onClick={handleFileUpload}
              disabled={!excelFile || uploadExcelMutation.isPending || previewData.length === 0}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
            >
              {uploadExcelMutation.isPending ? 'Creating Documents...' : 'Create Documents'}
            </button>
          </div>
        </div>
      </div>

      {previewData.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold mb-4">Preview Data ({previewData.length} rows)</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {Object.keys(previewData[0] || {}).map((key) => (
                    <th key={key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {previewData.slice(0, 5).map((row, index) => (
                  <tr key={index}>
                    {Object.values(row).map((value: any, cellIndex) => (
                      <td key={cellIndex} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {previewData.length > 5 && (
              <div className="text-center py-3 text-gray-500 text-sm">
                ... and {previewData.length - 5} more rows
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PaginationControls({ 
  currentPage, 
  totalPages, 
  onPageChange, 
  hasNextPage, 
  hasPrevPage 
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}) {
  const getVisiblePages = () => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    
    // Always show first page
    if (totalPages <= 1) return [1];
    
    for (let i = Math.max(2, currentPage - delta); 
         i <= Math.min(totalPages - 1, currentPage + delta); 
         i++) {
      range.push(i);
    }
    
    if (currentPage - delta > 2) {
      rangeWithDots.push(1, '...');
    } else {
      rangeWithDots.push(1);
    }
    
    rangeWithDots.push(...range);
    
    if (currentPage + delta < totalPages - 1) {
      rangeWithDots.push('...', totalPages);
    } else if (totalPages > 1) {
      rangeWithDots.push(totalPages);
    }
    
    return rangeWithDots;
  };
  
  const visiblePages = getVisiblePages();
  
  return (
    <div className="flex items-center justify-center space-x-1 mt-6">
      {/* First button */}
      <button
        onClick={() => onPageChange(1)}
        disabled={!hasPrevPage}
        className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-l-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        « First
      </button>
      
      {/* Previous button */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!hasPrevPage}
        className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ‹ Prev
      </button>
      
      {/* Page numbers */}
      {visiblePages.map((page, index) => (
        page === '...' ? (
          <span key={`dots-${index}`} className="px-3 py-2 text-sm font-medium text-gray-700">
            ...
          </span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page as number)}
            className={`px-3 py-2 text-sm font-medium border ${
              currentPage === page
                ? 'bg-blue-50 border-blue-500 text-blue-600'
                : 'text-gray-500 bg-white border-gray-300 hover:bg-gray-50'
            }`}
          >
            {page}
          </button>
        )
      ))}
      
      {/* Next button */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!hasNextPage}
        className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next ›
      </button>
      
      {/* Last button */}
      <button
        onClick={() => onPageChange(totalPages)}
        disabled={!hasNextPage}
        className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-r-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Last »
      </button>
    </div>
  );
}

function BulkDownload() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateType, setDateType] = useState<'created' | 'updated'>('created');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['/api/templates'],
    queryFn: async () => {
      const response = await fetch('/api/templates?limit=100');
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
  });

  const handlePreview = async () => {
    setIsLoading(true);
    try {
      const filters = {
        searchQuery: searchQuery.trim() || undefined,
        templateUuids: selectedTemplates.length > 0 ? selectedTemplates : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        dateType,
        archived: includeArchived
      };

      const response = await fetch('/api/documents/bulk-download/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filters }),
      });

      if (!response.ok) {
        throw new Error(`Failed to preview documents: ${response.statusText}`);
      }

      const data = await response.json();
      setPreviewData(data);
    } catch (error) {
      console.error('Preview error:', error);
      alert('Failed to preview documents: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!previewData || previewData.totalDocuments === 0) {
      alert('No documents to download');
      return;
    }

    if (previewData.totalDocuments > 100) {
      if (!confirm(`You are about to download ${previewData.totalDocuments} documents (${previewData.totalSizeMB} MB). This may take some time. Continue?`)) {
        return;
      }
    }

    setIsDownloading(true);
    try {
      const filters = {
        searchQuery: searchQuery.trim() || undefined,
        templateUuids: selectedTemplates.length > 0 ? selectedTemplates : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        dateType,
        archived: includeArchived
      };

      const response = await fetch('/api/documents/bulk-download/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filters }),
      });

      if (!response.ok) {
        throw new Error(`Failed to download documents: ${response.statusText}`);
      }

      // Handle the ZIP file download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `documents-bulk-download-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      alert('Documents downloaded successfully!');
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download documents: ' + (error as Error).message);
    } finally {
      setIsDownloading(false);
    }
  };

  const templateOptions = templates?.templates || [];

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center mb-6">
          <Link href="/" className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 mr-4">
            ← Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-green-800">Bulk Download Documents</h1>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-green-600 mt-0.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            <div>
              <h3 className="text-green-800 font-semibold">Bulk Download</h3>
              <p className="text-green-700 text-sm">
                Download multiple documents as a ZIP file based on your filter criteria. Documents will be organized by template folders.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Filters */}
          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-4">Filter Documents</h2>
            
            <div className="space-y-4">
              {/* Search Query */}
              <div>
                <label className="block text-sm font-medium mb-1">Search Documents</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by document name..."
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Template Filter */}
              <div>
                <label className="block text-sm font-medium mb-1">Templates</label>
                <div className="max-h-40 overflow-y-auto border border-gray-300 rounded p-2">
                  {templatesLoading ? (
                    <div className="text-sm text-gray-500">Loading templates...</div>
                  ) : templateOptions.length > 0 ? (
                    <div className="space-y-1">
                      {templateOptions.map((template: any) => (
                        <label key={template.uuid} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={selectedTemplates.includes(template.uuid)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTemplates([...selectedTemplates, template.uuid]);
                              } else {
                                setSelectedTemplates(selectedTemplates.filter(id => id !== template.uuid));
                              }
                            }}
                            className="mr-2"
                          />
                          <span className="text-sm">{template.name}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">No templates found</div>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {selectedTemplates.length > 0 ? `${selectedTemplates.length} template(s) selected` : 'All templates'}
                </div>
              </div>

              {/* Date Range */}
              <div>
                <label className="block text-sm font-medium mb-1">Date Range</label>
                <div className="space-y-2">
                  <select
                    value={dateType}
                    onChange={(e) => setDateType(e.target.value as 'created' | 'updated')}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="created">Filter by Creation Date</option>
                    <option value="updated">Filter by Update Date</option>
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="From"
                    />
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="To"
                    />
                  </div>
                </div>
              </div>

              {/* Include Archived */}
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={includeArchived}
                    onChange={(e) => setIncludeArchived(e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm">Include archived documents</span>
                </label>
              </div>

              {/* Preview Button */}
              <button
                onClick={handlePreview}
                disabled={isLoading}
                className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Loading...' : 'Preview Documents'}
              </button>
            </div>
          </div>

          {/* Right Column - Preview Results */}
          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-4">Download Preview</h2>
            
            {!previewData ? (
              <div className="text-center text-gray-500 py-8">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                <p>Click "Preview Documents" to see what will be downloaded</p>
              </div>
            ) : (
              <div>
                {/* Summary Stats */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-green-50 p-3 rounded">
                    <div className="text-lg font-bold text-green-800">{previewData.totalDocuments}</div>
                    <div className="text-sm text-green-600">Total Documents</div>
                  </div>
                  <div className="bg-blue-50 p-3 rounded">
                    <div className="text-lg font-bold text-blue-800">{previewData.totalSizeMB} MB</div>
                    <div className="text-sm text-blue-600">Estimated Size</div>
                  </div>
                </div>

                {previewData.missingFiles > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
                    <div className="text-yellow-800 text-sm">
                      <strong>Warning:</strong> {previewData.missingFiles} document(s) have missing files and will be skipped.
                    </div>
                  </div>
                )}

                {/* Templates Breakdown */}
                <div className="mb-4">
                  <h3 className="font-medium mb-2">Documents by Template:</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {Object.entries(previewData.groupedByTemplate || {}).map(([templateId, group]: [string, any]) => (
                      <div key={templateId} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                        <span className="text-sm font-medium">{group.templateName}</span>
                        <span className="text-sm text-gray-600">{group.count} docs</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sample Documents */}
                {previewData.documents && previewData.documents.length > 0 && (
                  <div className="mb-4">
                    <h3 className="font-medium mb-2">Sample Documents:</h3>
                    <div className="space-y-1 max-h-32 overflow-y-auto text-sm">
                      {previewData.documents.slice(0, 5).map((doc: any) => (
                        <div key={doc.uuid} className="flex justify-between items-center py-1">
                          <span className="truncate">{doc.name}</span>
                          <span className={`text-xs px-2 py-1 rounded ${doc.exists ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {doc.exists ? 'Available' : 'Missing'}
                          </span>
                        </div>
                      ))}
                      {previewData.totalDocuments > 5 && (
                        <div className="text-xs text-gray-500 pt-1">
                          ...and {previewData.totalDocuments - 5} more documents
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Download Button */}
                <button
                  onClick={handleDownload}
                  disabled={isDownloading || previewData.totalDocuments === 0 || previewData.validDocuments === 0}
                  className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDownloading ? 'Preparing Download...' : 
                   previewData.totalDocuments === 0 ? 'No Documents Found' :
                   previewData.validDocuments === 0 ? 'No Valid Files Found' :
                   `Download ${previewData.validDocuments} Documents`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BulkDelete() {
  const [filters, setFilters] = useState({
    searchQuery: '',
    templateUuids: [] as string[],
    dateFrom: '',
    dateTo: '',
    dateType: 'created' as 'created' | 'updated'
  });
  const [preview, setPreview] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get templates for filter dropdown
  const { data: templatesResponse } = useQuery({
    queryKey: ['/api/templates'],
    queryFn: () => fetch('/api/templates').then(res => res.json())
  });
  
  const templates = templatesResponse?.templates || [];

  const previewMutation = useMutation({
    mutationFn: async (filters: any) => {
      const response = await fetch('/api/documents/bulk-delete/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters })
      });
      if (!response.ok) throw new Error('Failed to preview');
      return response.json();
    },
    onSuccess: (data) => {
      setPreview(data);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (filters: any) => {
      const response = await fetch('/api/documents/bulk-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters, confirm: true })
      });
      if (!response.ok) throw new Error('Failed to delete');
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Bulk Delete Completed", 
        description: data.message 
      });
      setPreview(null);
      setShowConfirmDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    }
  });

  const handlePreview = () => {
    previewMutation.mutate(filters);
  };

  const handleDelete = () => {
    deleteMutation.mutate(filters);
  };

  const handleTemplateChange = (templateUuid: string) => {
    setFilters(prev => ({
      ...prev,
      templateUuids: prev.templateUuids.includes(templateUuid)
        ? prev.templateUuids.filter(id => id !== templateUuid)
        : [...prev.templateUuids, templateUuid]
    }));
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center mb-6">
        <Link href="/documents" className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 mr-4">
          ← Back to Documents
        </Link>
        <h1 className="text-2xl font-bold text-red-600">Bulk Delete Documents</h1>
      </div>

      <div className="bg-white p-6 rounded-lg shadow border mb-6">
        <h3 className="text-lg font-semibold mb-4 text-red-600">⚠️ Warning: This action cannot be undone</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Search Filter */}
          <div>
            <label className="block text-sm font-medium mb-2">Search Query</label>
            <input
              type="text"
              className="w-full p-2 border rounded"
              placeholder="Search document names..."
              value={filters.searchQuery}
              onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
            />
          </div>

          {/* Date Type Filter */}
          <div>
            <label className="block text-sm font-medium mb-2">Date Filter Type</label>
            <select
              className="w-full p-2 border rounded"
              value={filters.dateType}
              onChange={(e) => setFilters(prev => ({ ...prev, dateType: e.target.value as 'created' | 'updated' }))}
            >
              <option value="created">Created Date</option>
              <option value="updated">Updated Date</option>
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-sm font-medium mb-2">From Date</label>
            <input
              type="date"
              className="w-full p-2 border rounded"
              value={filters.dateFrom}
              onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-sm font-medium mb-2">To Date</label>
            <input
              type="date"
              className="w-full p-2 border rounded"
              value={filters.dateTo}
              onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
            />
          </div>
        </div>

        {/* Template Filter */}
        <div className="mt-6">
          <label className="block text-sm font-medium mb-2">Filter by Templates</label>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-40 overflow-y-auto border p-3 rounded">
            {templates.map((template: any) => (
              <label key={template.uuid} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={filters.templateUuids.includes(template.uuid)}
                  onChange={() => handleTemplateChange(template.uuid)}
                />
                <span className="text-sm">{template.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={handlePreview}
            disabled={previewMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {previewMutation.isPending ? 'Loading Preview...' : 'Preview Documents to Delete'}
          </button>
        </div>
      </div>

      {/* Preview Results */}
      {preview && (
        <div className="bg-white p-6 rounded-lg shadow border mb-6">
          <h3 className="text-lg font-semibold mb-4">
            Preview: {preview.totalMatching} documents will be deleted
          </h3>
          
          {preview.totalMatching > 0 ? (
            <>
              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  Showing first {Math.min(10, preview.totalMatching)} documents:
                </p>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border p-2 text-left">Document Name</th>
                      <th className="border p-2 text-left">Template</th>
                      <th className="border p-2 text-left">Created</th>
                      <th className="border p-2 text-left">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.documents.map((doc: any) => (
                      <tr key={doc.uuid}>
                        <td className="border p-2">{doc.name}</td>
                        <td className="border p-2">{doc.templateName}</td>
                        <td className="border p-2">{new Date(doc.createdAt).toLocaleDateString()}</td>
                        <td className="border p-2">{new Date(doc.updatedAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setShowConfirmDialog(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Delete {preview.totalMatching} Documents
                </button>
              </div>
            </>
          ) : (
            <p className="text-gray-600">No documents match the specified criteria.</p>
          )}
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4 text-red-600">
              ⚠️ Confirm Bulk Delete
            </h3>
            <p className="mb-6">
              Are you absolutely sure you want to delete {preview?.totalMatching} documents? 
              This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Yes, Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('user');
  const [password, setPassword] = useState('password');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const endpoint = isLogin ? '/api/login' : '/api/register';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        window.location.href = '/';
      } else {
        const error = await response.text();
        alert(error || 'Authentication failed');
      }
    } catch (error) {
      alert('Network error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow border p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Document Manager</h1>
          <p className="text-gray-600 mt-2">
            {isLogin ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
          >
            {isLoading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-blue-500 hover:text-blue-600 text-sm"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>

        <div className="mt-6 text-center text-xs text-gray-500">
          <p>Demo credentials:</p>
          <p>Username: user | Password: password</p>
        </div>
      </div>
    </div>
  );
}

function Navigation() {
  const [location] = useLocation();
  
  return (
    <nav className="bg-white shadow-sm border-b mb-6">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link href="/" className="text-xl font-bold text-gray-900 hover:text-gray-700">
              Document Manager
            </Link>
            <div className="flex space-x-1">
              <Link 
                href="/" 
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  location === '/' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Dashboard
              </Link>
              <Link 
                href="/templates" 
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  location === '/templates' || location.startsWith('/template-') 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Templates
              </Link>
              <Link 
                href="/documents" 
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  location === '/documents' || location.startsWith('/document-') 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Documents
              </Link>
              <Link 
                href="/bulk-delete" 
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
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

function App() {
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
          <Route path="/bulk-download">
            <BulkDownload />
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

export default App;