import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface HealthCheckResult {
  templates: {
    total: number;
    valid: number;
    invalid: number;
    invalidFiles: string[];
  };
  documents: {
    total: number;
    valid: number;
    invalid: number;
    invalidFiles: string[];
  };
  status: 'healthy' | 'issues_found';
}

export function HealthCheck() {
  const [isChecking, setIsChecking] = useState(false);
  const [healthResult, setHealthResult] = useState<HealthCheckResult | null>(null);
  const [isFixing, setIsFixing] = useState(false);
  const { toast } = useToast();

  const runHealthCheck = async () => {
    setIsChecking(true);
    try {
      const response = await fetch('/api/health/file-integrity');
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.statusText}`);
      }
      const result: HealthCheckResult = await response.json();
      setHealthResult(result);
      
      if (result.status === 'healthy') {
        toast({
          title: "System Healthy",
          description: "All files are accessible and valid.",
        });
      } else {
        toast({
          title: "Issues Found",
          description: `Found ${result.templates.invalid + result.documents.invalid} invalid file references.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Health check error:', error);
      toast({
        title: "Health Check Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsChecking(false);
    }
  };

  const fixIssues = async () => {
    if (!healthResult || healthResult.status === 'healthy') return;
    
    setIsFixing(true);
    try {
      // Extract UUIDs from invalid files (simplified approach)
      const templateUuids: string[] = [];
      const documentUuids: string[] = [];
      
      const response = await fetch('/api/health/fix-file-references', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateUuids,
          documentUuids,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Fix failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      toast({
        title: "Issues Fixed",
        description: `Fixed ${result.templatesFixed} template(s) and ${result.documentsFixed} document(s).`,
      });
      
      // Re-run health check
      await runHealthCheck();
    } catch (error) {
      console.error('Fix error:', error);
      toast({
        title: "Fix Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          File Integrity Check
          {healthResult?.status === 'healthy' && <CheckCircle className="h-5 w-5 text-green-500" />}
          {healthResult?.status === 'issues_found' && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button 
            onClick={runHealthCheck} 
            disabled={isChecking}
            variant="outline"
          >
            {isChecking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Run Health Check
          </Button>
          
          {healthResult?.status === 'issues_found' && (
            <Button 
              onClick={fixIssues} 
              disabled={isFixing}
              variant="destructive"
            >
              {isFixing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Fix Issues
            </Button>
          )}
        </div>

        {healthResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium">Templates</h4>
                <div className="flex gap-2">
                  <Badge variant="outline">
                    Total: {healthResult.templates.total}
                  </Badge>
                  <Badge variant="success">
                    Valid: {healthResult.templates.valid}
                  </Badge>
                  {healthResult.templates.invalid > 0 && (
                    <Badge variant="destructive">
                      Invalid: {healthResult.templates.invalid}
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium">Documents</h4>
                <div className="flex gap-2">
                  <Badge variant="outline">
                    Total: {healthResult.documents.total}
                  </Badge>
                  <Badge variant="success">
                    Valid: {healthResult.documents.valid}
                  </Badge>
                  {healthResult.documents.invalid > 0 && (
                    <Badge variant="destructive">
                      Invalid: {healthResult.documents.invalid}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {(healthResult.templates.invalidFiles.length > 0 || healthResult.documents.invalidFiles.length > 0) && (
              <div className="space-y-2">
                <h4 className="font-medium text-red-600">Invalid Files:</h4>
                <div className="max-h-40 overflow-y-auto text-sm">
                  {[...healthResult.templates.invalidFiles, ...healthResult.documents.invalidFiles].map((file, index) => (
                    <div key={index} className="text-red-600 font-mono text-xs">
                      {file}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}